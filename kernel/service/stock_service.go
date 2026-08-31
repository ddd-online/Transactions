package service

import (
	"fmt"
	"io"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/sirupsen/logrus"
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/transform"

	"github.com/transactions/dao"
	"github.com/transactions/models"
	"github.com/transactions/models/dto"
	"github.com/transactions/util"
	"github.com/transactions/workspace"
)

// StockService 股票账户服务。
type StockService interface {
	GetOverview(ws *workspace.Workspace, ledgerID string) (*dto.StockOverviewDto, error)
	SetPrincipal(ws *workspace.Workspace, ledgerID string, amount int64) (*dto.StockOverviewDto, error)
	AddPrincipal(ws *workspace.Workspace, ledgerID string, amount int64) (*dto.StockOverviewDto, error)
	GetFeeSettings(ws *workspace.Workspace, ledgerID string) (*models.StockFeeSetting, error)
	SaveFeeSettings(ws *workspace.Workspace, ledgerID string, commissionRate float64, minCommission int64, stampDutyRate float64, transferFeeRate float64) (*models.StockFeeSetting, error)
	ListFundRecords(ws *workspace.Workspace, ledgerID string, page int, pageSize int) (*dto.StockFundRecordPage, error)
	ListPositions(ws *workspace.Workspace, ledgerID string) ([]dto.StockPositionDto, error)
	ListTrades(ws *workspace.Workspace, ledgerID string, stockCode string) ([]dto.StockTradeDto, error)
	CreateTrade(ws *workspace.Workspace, ledgerID string, stockCode string, stockName string, tradeType string, priceCents int64, lots int64, tradeTime int64, remark string) (*dto.StockTradeDto, error)
	LookupStockName(ws *workspace.Workspace, stockCode string) (*dto.StockNameDto, error)
	ResetData(ws *workspace.Workspace, ledgerID string) error
}

var _ StockService = &stockServiceImpl{}

type stockServiceImpl struct {
	stockDao dao.StockDao
}

func NewStockService(stockDao dao.StockDao) StockService {
	return &stockServiceImpl{stockDao: stockDao}
}

// GetOrCreateAccount 获取账户，不存在则创建（本金为 0），保证服务层永远拿到有效账户。
func (s *stockServiceImpl) getOrCreateAccount(ws *workspace.Workspace, ledgerID string) (*models.StockAccount, error) {
	account, err := s.stockDao.GetAccount(ws, ledgerID)
	if err == nil {
		return account, nil
	}
	if !dao.IsNotFound(err) {
		return nil, err
	}
	account = &models.StockAccount{
		ID:       util.GetUUID(),
		LedgerID: ledgerID,
	}
	if err := s.stockDao.CreateAccount(ws, account); err != nil {
		return nil, err
	}
	return account, nil
}

// getOrCreateFeeSetting 获取费用设置，不存在则按默认值创建（万2.354 / 5元 / 0.05% / 0.001%）。
func (s *stockServiceImpl) getOrCreateFeeSetting(ws *workspace.Workspace, ledgerID string) (*models.StockFeeSetting, error) {
	setting, err := s.stockDao.GetFeeSetting(ws, ledgerID)
	if err == nil {
		return setting, nil
	}
	if !dao.IsNotFound(err) {
		return nil, err
	}
	setting = &models.StockFeeSetting{
		ID:              util.GetUUID(),
		LedgerID:        ledgerID,
		CommissionRate:  0.0002354, // 万2.354
		MinCommission:   500,       // 5 元/笔
		StampDutyRate:   0.0005,    // 0.05%，卖出时收
		TransferFeeRate: 0.00001,   // 0.001%，买卖双向，仅沪市
	}
	if err := s.stockDao.CreateFeeSetting(ws, setting); err != nil {
		return nil, err
	}
	return setting, nil
}

func (s *stockServiceImpl) GetOverview(ws *workspace.Workspace, ledgerID string) (*dto.StockOverviewDto, error) {
	account, err := s.getOrCreateAccount(ws, ledgerID)
	if err != nil {
		return nil, err
	}

	// 当前现金：末条资金记录余额；无记录时全部为本金
	currentCash := account.Principal
	latest, err := s.stockDao.QueryLatestFundRecord(ws, ledgerID)
	if err == nil && latest != nil {
		currentCash = latest.CashBalance
	} else if err != nil && !dao.IsNotFound(err) {
		return nil, err
	}

	// 已实现总盈亏：Σ 卖出净盈亏（未实现盈亏不计入）
	realizedPnl, err := s.stockDao.SumNetPnl(ws, ledgerID)
	if err != nil {
		return nil, err
	}

	// 总资产 = 当前现金 + 持仓市值（持仓模块接入后填充）
	positionMarketValue := int64(0)
	totalAssets := currentCash + positionMarketValue

	// 总盈亏占本金百分比，本金为 0 时按 0 处理（防除零）
	var totalPnlPercent float64
	if account.Principal > 0 {
		totalPnlPercent = math.Round(float64(realizedPnl)/float64(account.Principal)*10000) / 100
	}

	return &dto.StockOverviewDto{
		Principal:           account.Principal,
		CurrentCash:         currentCash,
		PositionMarketValue: positionMarketValue,
		TotalAssets:         totalAssets,
		RealizedPnl:         realizedPnl,
		TotalPnlPercent:     totalPnlPercent,
	}, nil
}

func (s *stockServiceImpl) SetPrincipal(ws *workspace.Workspace, ledgerID string, amount int64) (*dto.StockOverviewDto, error) {
	if amount <= 0 {
		return nil, models.NewBadRequest("本金必须大于 0")
	}

	// 确保账户存在
	if _, err := s.getOrCreateAccount(ws, ledgerID); err != nil {
		return nil, err
	}

	// 已有资金记录时禁止修改初始本金，避免现金余额链条断裂
	count, err := s.stockDao.CountFundRecords(ws, ledgerID)
	if err != nil {
		return nil, err
	}
	if count > 0 {
		return nil, models.NewConflict("已有资金变化记录，请使用「追加本金」")
	}

	if err := s.stockDao.UpdateAccountPrincipal(ws, ledgerID, amount); err != nil {
		logrus.Errorf("设置本金失败, ledger: %s, err: %v", ledgerID, err)
		return nil, err
	}
	logrus.Infof("设置股票账户本金, ledger: %s, principal: %d", ledgerID, amount)
	return s.GetOverview(ws, ledgerID)
}

func (s *stockServiceImpl) AddPrincipal(ws *workspace.Workspace, ledgerID string, amount int64) (*dto.StockOverviewDto, error) {
	if amount <= 0 {
		return nil, models.NewBadRequest("追加金额必须大于 0")
	}

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		account, err := s.getOrCreateAccount(tx, ledgerID)
		if err != nil {
			return err
		}

		// 追加前现金：末条记录余额，无记录则为本金
		prevCash := account.Principal
		if latest, err := s.stockDao.QueryLatestFundRecord(tx, ledgerID); err == nil && latest != nil {
			prevCash = latest.CashBalance
		} else if err != nil && !dao.IsNotFound(err) {
			return err
		}

		newPrincipal := account.Principal + amount
		if err := s.stockDao.UpdateAccountPrincipal(tx, ledgerID, newPrincipal); err != nil {
			return err
		}

		record := &models.StockFundRecord{
			ID:           util.GetUUID(),
			LedgerID:     ledgerID,
			RecordDate:   time.Now().Format("2006-01-02"),
			EventType:    models.StockEventAddPrincipal,
			EventText:    "追加本金",
			AmountChange: amount,
			CashBalance:  prevCash + amount,
			Remark:       fmt.Sprintf("本金 %s → %s", centsToYuanStr(account.Principal), centsToYuanStr(newPrincipal)),
		}
		if err := s.stockDao.CreateFundRecord(tx, record); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		logrus.Errorf("追加本金失败, ledger: %s, amount: %d, err: %v", ledgerID, amount, err)
		return nil, err
	}
	logrus.Infof("追加股票账户本金, ledger: %s, amount: %d", ledgerID, amount)
	return s.GetOverview(ws, ledgerID)
}

func (s *stockServiceImpl) GetFeeSettings(ws *workspace.Workspace, ledgerID string) (*models.StockFeeSetting, error) {
	return s.getOrCreateFeeSetting(ws, ledgerID)
}

func (s *stockServiceImpl) SaveFeeSettings(ws *workspace.Workspace, ledgerID string, commissionRate float64, minCommission int64, stampDutyRate float64, transferFeeRate float64) (*models.StockFeeSetting, error) {
	// 佣金费率必须为正；最低佣金、印花税、过户费允许为 0（不收取），但不能为负
	if commissionRate <= 0 || minCommission < 0 || stampDutyRate < 0 || transferFeeRate < 0 {
		return nil, models.NewBadRequest("佣金费率必须大于 0，最低佣金与费率不能为负")
	}

	setting, err := s.getOrCreateFeeSetting(ws, ledgerID)
	if err != nil {
		return nil, err
	}
	setting.CommissionRate = commissionRate
	setting.MinCommission = minCommission
	setting.StampDutyRate = stampDutyRate
	setting.TransferFeeRate = transferFeeRate

	if err := s.stockDao.UpdateFeeSetting(ws, setting); err != nil {
		logrus.Errorf("保存交易费用设置失败, ledger: %s, err: %v", ledgerID, err)
		return nil, err
	}
	return setting, nil
}

func (s *stockServiceImpl) ListFundRecords(ws *workspace.Workspace, ledgerID string, page int, pageSize int) (*dto.StockFundRecordPage, error) {
	if page < 1 {
		page = 1
	}
	if pageSize < 1 {
		pageSize = 10
	}
	if pageSize > 100 {
		pageSize = 100
	}

	records, total, err := s.stockDao.QueryFundRecords(ws, ledgerID, page, pageSize)
	if err != nil {
		return nil, err
	}

	items := make([]dto.StockFundRecordDto, 0, len(records))
	for i := range records {
		items = append(items, dto.FromStockFundRecord(&records[i]))
	}
	return &dto.StockFundRecordPage{
		Items:    items,
		Total:    total,
		Page:     page,
		PageSize: pageSize,
	}, nil
}

func (s *stockServiceImpl) ListPositions(ws *workspace.Workspace, ledgerID string) ([]dto.StockPositionDto, error) {
	positions, err := s.stockDao.ListPositions(ws, ledgerID)
	if err != nil {
		return nil, err
	}
	items := make([]dto.StockPositionDto, 0, len(positions))
	for i := range positions {
		if positions[i].Quantity <= 0 {
			continue // 已清仓的股票不再出现在持仓列表
		}
		items = append(items, dto.FromStockPosition(&positions[i]))
	}
	return items, nil
}

func (s *stockServiceImpl) ListTrades(ws *workspace.Workspace, ledgerID string, stockCode string) ([]dto.StockTradeDto, error) {
	if stockCode == "" {
		return nil, models.NewBadRequest("stock_code is required")
	}
	trades, err := s.stockDao.ListTrades(ws, ledgerID, stockCode)
	if err != nil {
		return nil, err
	}
	items := make([]dto.StockTradeDto, 0, len(trades))
	for i := range trades {
		items = append(items, dto.FromStockTrade(&trades[i]))
	}
	return items, nil
}

// CreateTrade 记录一笔买卖交易：原子更新持仓、现金资金记录与交易流水。
// 买入（建仓/加仓）：现金减少 成交金额+费用；卖出（减仓/清仓）：现金增加 成交金额-费用，
// 并按平均成本结转已实现盈亏到资金记录（netPnl），使账户总盈亏自动汇总。
func (s *stockServiceImpl) CreateTrade(ws *workspace.Workspace, ledgerID string, stockCode string, stockName string, tradeType string, priceCents int64, lots int64, tradeTime int64, remark string) (*dto.StockTradeDto, error) {
	if priceCents <= 0 {
		return nil, models.NewBadRequest("成交价必须大于 0")
	}
	if lots <= 0 {
		return nil, models.NewBadRequest("手数必须大于 0")
	}
	if tradeTime <= 0 {
		tradeTime = time.Now().Unix()
	}

	isBuy := tradeType == models.StockTradeOpen || tradeType == models.StockTradeAdd
	isSell := tradeType == models.StockTradeReduce || tradeType == models.StockTradeClose
	if !isBuy && !isSell {
		return nil, models.NewBadRequest("无效的交易类型")
	}

	shares := lots * 100
	amount := priceCents * shares
	// 沪市：60（主板）/ 68（科创板）开头
	isSH := strings.HasPrefix(stockCode, "60") || strings.HasPrefix(stockCode, "68")

	trade := &models.StockTrade{
		ID:        util.GetUUID(),
		LedgerID:  ledgerID,
		StockCode: stockCode,
		StockName: stockName,
		TradeType: tradeType,
		Price:     priceCents,
		Lots:      lots,
		Shares:    shares,
		Amount:    amount,
		TradeTime: tradeTime,
		Remark:    remark,
	}

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		feeSetting, err := s.getOrCreateFeeSetting(tx, ledgerID)
		if err != nil {
			return err
		}

		var feeBreakdown FeeBreakdown
		if isBuy {
			feeBreakdown = ComputeBuyFee(amount, isSH, feeSetting)
		} else {
			feeBreakdown = ComputeSellFee(amount, isSH, feeSetting)
		}
		trade.Fee = feeBreakdown.Total
		trade.Commission = feeBreakdown.Commission
		trade.StampDuty = feeBreakdown.StampDuty
		trade.TransferFee = feeBreakdown.TransferFee

		position, err := s.stockDao.GetPosition(tx, ledgerID, stockCode)
		if dao.IsNotFound(err) {
			position = &models.StockPosition{
				ID:        util.GetUUID(),
				LedgerID:  ledgerID,
				StockCode: stockCode,
				StockName: stockName,
			}
			if err := s.stockDao.CreatePosition(tx, position); err != nil {
				return err
			}
		} else if err != nil {
			return err
		}
		position.StockName = stockName

		// 当前现金：末条资金记录余额，无记录则为本金
		account, err := s.getOrCreateAccount(tx, ledgerID)
		if err != nil {
			return err
		}
		prevCash := account.Principal
		if latest, err := s.stockDao.QueryLatestFundRecord(tx, ledgerID); err == nil && latest != nil {
			prevCash = latest.CashBalance
		} else if err != nil && !dao.IsNotFound(err) {
			return err
		}

		var amountChange int64
		var eventType string
		var eventText string
		var netPnl *int64
		if isBuy {
			amountChange = -(amount + feeBreakdown.Total)
			eventType = models.StockEventBuy
			eventText = fmt.Sprintf("买入 %s %d手", stockName, lots)

			position.Quantity += shares
			position.TotalCost += amount + feeBreakdown.Total
		} else {
			if shares > position.Quantity {
				return models.NewBadRequest(fmt.Sprintf("卖出数量超过持仓（当前 %d 股）", position.Quantity))
			}
			amountChange = amount - feeBreakdown.Total
			eventType = models.StockEventSell
			eventText = fmt.Sprintf("卖出 %s %d手", stockName, lots)

			// 按剩余总成本的比例结转（四舍五入到分），避免整除截断造成已实现盈亏偏差
			costBasis := int64(math.Round(float64(position.TotalCost) * float64(shares) / float64(position.Quantity)))
			realized := amount - feeBreakdown.Total - costBasis
			netPnl = &realized

			position.Quantity -= shares
			position.TotalCost -= costBasis
			position.RealizedPnl += realized
			if position.Quantity == 0 {
				position.TotalCost = 0
			}
		}
		trade.RealizedPnl = netPnl

		if err := s.stockDao.UpdatePosition(tx, position); err != nil {
			return err
		}

		record := &models.StockFundRecord{
			ID:           util.GetUUID(),
			LedgerID:     ledgerID,
			RecordDate:   time.Unix(tradeTime, 0).Format("2006-01-02"),
			EventType:    eventType,
			EventText:    eventText,
			AmountChange: amountChange,
			CashBalance:  prevCash + amountChange,
			NetPnl:       netPnl,
			Remark:       fmt.Sprintf("%s %d手 @ %s", stockName, lots, centsToYuanStr(priceCents)),
		}
		if err := s.stockDao.CreateFundRecord(tx, record); err != nil {
			return err
		}

		return s.stockDao.CreateTrade(tx, trade)
	})
	if err != nil {
		logrus.Errorf("记录股票交易失败, ledger: %s, code: %s, err: %v", ledgerID, stockCode, err)
		return nil, err
	}
	dto := dto.FromStockTrade(trade)
	return &dto, nil
}

var (
	stockCodePattern = regexp.MustCompile(`^(60|68|00|30)\d{4}$`)
	quoteFieldPattern = regexp.MustCompile(`"([^"]*)"`)
)

// LookupStockName 按股票代码查询股票名称：优先本地已有交易记录，未命中时走外部行情接口兜底。
func (s *stockServiceImpl) LookupStockName(ws *workspace.Workspace, stockCode string) (*dto.StockNameDto, error) {
	if stockCode == "" {
		return nil, models.NewBadRequest("stock_code is required")
	}
	name, err := s.stockDao.QueryStockName(ws, stockCode)
	if err == nil && name != "" {
		return &dto.StockNameDto{StockCode: stockCode, StockName: name}, nil
	}
	if err != nil && !dao.IsNotFound(err) {
		logrus.Warnf("查询本地股票名称失败, code: %s, err: %v", stockCode, err)
	}
	return &dto.StockNameDto{StockCode: stockCode, StockName: fetchStockNameExternal(stockCode)}, nil
}

// fetchStockNameExternal 从腾讯行情接口查询 A 股股票名称，失败返回空串（不阻塞录入流程）。
func fetchStockNameExternal(stockCode string) string {
	// 仅支持 A 股六位代码（沪 60/68、深 00/30），避免非法入参打到外部接口
	if !stockCodePattern.MatchString(stockCode) {
		return ""
	}
	market := "sz"
	if strings.HasPrefix(stockCode, "60") || strings.HasPrefix(stockCode, "68") {
		market = "sh"
	}
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get(fmt.Sprintf("http://qt.gtimg.cn/q=%s%s", market, stockCode))
	if err != nil {
		logrus.Warnf("查询股票名称失败(网络), code: %s, err: %v", stockCode, err)
		return ""
	}
	defer resp.Body.Close()
	decoded, err := io.ReadAll(transform.NewReader(resp.Body, simplifiedchinese.GBK.NewDecoder()))
	if err != nil {
		logrus.Warnf("查询股票名称失败(解码), code: %s, err: %v", stockCode, err)
		return ""
	}
	matches := quoteFieldPattern.FindSubmatch(decoded)
	if len(matches) < 2 {
		return ""
	}
	parts := strings.Split(string(matches[1]), "~")
	if len(parts) < 2 {
		return ""
	}
	return strings.TrimSpace(parts[1])
}

// ResetData 清空指定账本的全部股票交易数据。
func (s *stockServiceImpl) ResetData(ws *workspace.Workspace, ledgerID string) error {
	if err := s.stockDao.ResetByLedgerId(ws, ledgerID); err != nil {
		logrus.Errorf("重置股票交易数据失败, err: %v", err)
		return err
	}
	return nil
}

// FeeBreakdown 一笔交易的费用明细（单位：分）。
type FeeBreakdown struct {
	Commission  int64 // 佣金
	StampDuty   int64 // 印花税（买入恒为 0）
	TransferFee int64 // 过户费（仅沪市收取，双向）
	Total       int64 // 合计
}

// roundToCents 按费率计算费用并四舍五入到分。
func roundToCents(amount int64, rate float64) int64 {
	return int64(math.Round(float64(amount) * rate))
}

// computeCommission 佣金 = max(金额×费率, 最低佣金)。
func computeCommission(amount int64, setting *models.StockFeeSetting) int64 {
	commission := roundToCents(amount, setting.CommissionRate)
	if commission < setting.MinCommission {
		commission = setting.MinCommission
	}
	return commission
}

// ComputeBuyFee 买入费用 = 佣金 + 过户费（仅沪市）。
// 供后续「交易记录」模块计算实际买入成本使用。
func ComputeBuyFee(amount int64, isSH bool, setting *models.StockFeeSetting) FeeBreakdown {
	commission := computeCommission(amount, setting)
	var transferFee int64
	if isSH {
		transferFee = roundToCents(amount, setting.TransferFeeRate)
	}
	return FeeBreakdown{
		Commission:  commission,
		TransferFee: transferFee,
		Total:       commission + transferFee,
	}
}

// ComputeSellFee 卖出费用 = 佣金 + 印花税 + 过户费（仅沪市）。
// 印花税仅卖出时收取。供后续「交易记录」模块计算净卖出金额与净盈亏使用。
func ComputeSellFee(amount int64, isSH bool, setting *models.StockFeeSetting) FeeBreakdown {
	commission := computeCommission(amount, setting)
	stampDuty := roundToCents(amount, setting.StampDutyRate)
	var transferFee int64
	if isSH {
		transferFee = roundToCents(amount, setting.TransferFeeRate)
	}
	return FeeBreakdown{
		Commission:  commission,
		StampDuty:   stampDuty,
		TransferFee: transferFee,
		Total:       commission + stampDuty + transferFee,
	}
}

// centsToYuanStr 分 → 保留两位小数的元字符串，用于资金记录备注。
func centsToYuanStr(cents int64) string {
	return strconv.FormatFloat(float64(cents)/100, 'f', 2, 64)
}
