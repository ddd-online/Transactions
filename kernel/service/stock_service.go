package service

import (
	"fmt"
	"io"
	"math"
	"net/http"
	"regexp"
	"sort"
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
	AddPrincipalAtDate(ws *workspace.Workspace, ledgerID string, amount int64, recordDate string) (*dto.StockOverviewDto, error)
	AddWithdraw(ws *workspace.Workspace, ledgerID string, amount int64) (*dto.StockOverviewDto, error)
	AddWithdrawAtDate(ws *workspace.Workspace, ledgerID string, amount int64, recordDate string) (*dto.StockOverviewDto, error)
	GetFeeSettings(ws *workspace.Workspace, ledgerID string) (*models.StockFeeSetting, error)
	SaveFeeSettings(ws *workspace.Workspace, ledgerID string, commissionRate float64, minCommission int64, stampDutyRate float64, transferFeeRate float64) (*models.StockFeeSetting, error)
	ListFundRecords(ws *workspace.Workspace, ledgerID string, page int, pageSize int) (*dto.StockFundRecordPage, error)
	ListPositions(ws *workspace.Workspace, ledgerID string) ([]dto.StockPositionDto, error)
	ListTrades(ws *workspace.Workspace, ledgerID string, stockCode string) ([]dto.StockTradeDto, error)
	CreateTrade(ws *workspace.Workspace, ledgerID string, stockCode string, stockName string, tradeType string, priceCents int64, lots int64, tradeTime int64, remark string) (*dto.StockTradeDto, error)
	UpdateTrade(ws *workspace.Workspace, ledgerID string, tradeID string, priceCents int64, lots int64, tradeTime int64) (*dto.StockTradeDto, error)
	ListTradeHistories(ws *workspace.Workspace, ledgerID string) ([]dto.StockTradeHistoryDto, error)
	GetTradeHistoryDetail(ws *workspace.Workspace, ledgerID string, stockCode string) (*dto.StockTradeHistoryDetailDto, error)
	GetTradeHistorySummary(ws *workspace.Workspace, ledgerID string) (*dto.StockTradeHistorySummaryDto, error)
	GetStatistics(ws *workspace.Workspace, ledgerID string) (*dto.StockStatisticsDto, error)
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

	// 已实现总盈亏：Σ 卖出净盈亏（未实现盈亏不计入）
	realizedPnl, err := s.stockDao.SumNetPnl(ws, ledgerID)
	if err != nil {
		return nil, err
	}

	// 累计支取：Σ 支取事件金额
	withdrawnTotal, err := s.stockDao.SumWithdrawn(ws, ledgerID)
	if err != nil {
		return nil, err
	}

	// 总资产 = 本金 + 总盈亏 − 累计支取（本金不因支取减少，保持"累计投入"语义）
	totalAssets := account.Principal + realizedPnl - withdrawnTotal
	// 可用现金 = 总资产 − 当前持仓成本（持仓按成本计价，与资金链现金余额一致）
	positionCost, err := s.stockDao.SumPositionCost(ws, ledgerID)
	if err != nil {
		return nil, err
	}
	availableCash := totalAssets - positionCost
	// 持仓市值预留：接入行情后用于展示浮盈资产（当前恒为 0）
	positionMarketValue := int64(0)

	// 总盈亏占本金百分比，本金为 0 时按 0 处理（防除零）
	var totalPnlPercent float64
	if account.Principal > 0 {
		totalPnlPercent = math.Round(float64(realizedPnl)/float64(account.Principal)*10000) / 100
	}

	return &dto.StockOverviewDto{
		Principal:           account.Principal,
		AvailableCash:       availableCash,
		PositionMarketValue: positionMarketValue,
		WithdrawnTotal:      withdrawnTotal,
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
	return s.AddPrincipalAtDate(ws, ledgerID, amount, "")
}

// AddPrincipalAtDate 追加本金并指定资金变化的发生日期；date 为空时按当天记录。
func (s *stockServiceImpl) AddPrincipalAtDate(ws *workspace.Workspace, ledgerID string, amount int64, date string) (*dto.StockOverviewDto, error) {
	if amount <= 0 {
		return nil, models.NewBadRequest("追加金额必须大于 0")
	}
	recordDate, err := normalizeStockRecordDate(date)
	if err != nil {
		return nil, err
	}

	err = ws.Transaction(func(tx *workspace.Workspace) error {
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
			RecordDate:   recordDate,
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

// AddWithdraw 从股票账户支取：现金减少 amount，本金保持不变（本金始终是"累计投入"）。
// 总资产 = 本金 + 总盈亏 − 累计支取，支取会相应减少总资产。
func (s *stockServiceImpl) AddWithdraw(ws *workspace.Workspace, ledgerID string, amount int64) (*dto.StockOverviewDto, error) {
	return s.AddWithdrawAtDate(ws, ledgerID, amount, "")
}

// AddWithdrawAtDate 从股票账户支取并指定资金变化的发生日期；date 为空时按当天记录。
// 总资产 = 本金 + 总盈亏 − 累计支取，支取会相应减少总资产。
func (s *stockServiceImpl) AddWithdrawAtDate(ws *workspace.Workspace, ledgerID string, amount int64, date string) (*dto.StockOverviewDto, error) {
	if amount <= 0 {
		return nil, models.NewBadRequest("支取金额必须大于 0")
	}
	recordDate, err := normalizeStockRecordDate(date)
	if err != nil {
		return nil, err
	}

	err = ws.Transaction(func(tx *workspace.Workspace) error {
		account, err := s.getOrCreateAccount(tx, ledgerID)
		if err != nil {
			return err
		}

		// 当前现金：末条资金记录余额，无记录时为本金
		prevCash := account.Principal
		if latest, err := s.stockDao.QueryLatestFundRecord(tx, ledgerID); err == nil && latest != nil {
			prevCash = latest.CashBalance
		} else if err != nil && !dao.IsNotFound(err) {
			return err
		}

		if amount > prevCash {
			return models.NewBadRequest(fmt.Sprintf("支取金额不能超过可用现金（%s 元）", centsToYuanStr(prevCash)))
		}

		afterCash := prevCash - amount
		record := &models.StockFundRecord{
			ID:           util.GetUUID(),
			LedgerID:     ledgerID,
			RecordDate:   recordDate,
			EventType:    models.StockEventWithdraw,
			EventText:    "支取",
			AmountChange: -amount,
			CashBalance:  afterCash,
			Remark:       fmt.Sprintf("现金 %s → %s", centsToYuanStr(prevCash), centsToYuanStr(afterCash)),
		}
		if err := s.stockDao.CreateFundRecord(tx, record); err != nil {
			return err
		}
		return nil
	})
	if err != nil {
		logrus.Errorf("支取失败, ledger: %s, amount: %d, err: %v", ledgerID, amount, err)
		return nil, err
	}
	logrus.Infof("股票账户支取, ledger: %s, amount: %d", ledgerID, amount)
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

	// 持仓中的股票只展示本轮（最近一次清仓之后）的交易，历史轮次留在「交易历史」页
	position, err := s.stockDao.GetPosition(ws, ledgerID, stockCode)
	if err == nil && position.Quantity > 0 {
		asc := make([]models.StockTrade, len(trades))
		for i := range trades {
			asc[len(trades)-1-i] = trades[i]
		}
		current := currentRoundTrades(asc)
		items := make([]dto.StockTradeDto, 0, len(current))
		for i := len(current) - 1; i >= 0; i-- {
			items = append(items, dto.FromStockTrade(&current[i]))
		}
		return items, nil
	}
	if err != nil && !dao.IsNotFound(err) {
		return nil, err
	}

	items := make([]dto.StockTradeDto, 0, len(trades))
	for i := range trades {
		items = append(items, dto.FromStockTrade(&trades[i]))
	}
	return items, nil
}

// currentRoundTrades 从按时间升序的交易流中切出当前在建轮次（最近一次清仓之后）的交易。
// 卖出把持仓数量归零时结束一轮，该笔卖出属于已完成的轮次，不计入当前轮。
func currentRoundTrades(trades []models.StockTrade) []models.StockTrade {
	var result []models.StockTrade
	var shares int64
	for i := range trades {
		t := &trades[i]
		switch t.TradeType {
		case models.StockTradeOpen, models.StockTradeAdd:
			shares += t.Shares
			result = append(result, *t)
		case models.StockTradeReduce, models.StockTradeClose:
			shares -= t.Shares
			if shares > 0 {
				result = append(result, *t)
			} else {
				shares = 0
				result = result[:0]
			}
		}
	}
	return result
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

		// 清仓：把本轮「建仓 → 清仓」的全部交易归档到交易历史
		if isSell && position.Quantity == 0 {
			roundID, err := s.closeRound(tx, ledgerID, stockCode, stockName, tradeTime)
			if err != nil {
				return err
			}
			trade.RoundID = roundID
		}

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

// closeRound 清仓收尾：确保历史集合存在（首次清仓创建，之后复用），
// 创建本轮次并把该股从建仓到清仓的全部未归档交易挂接进来。
func (s *stockServiceImpl) closeRound(ws *workspace.Workspace, ledgerID string, stockCode string, stockName string, closedAt int64) (string, error) {
	// 兼容存量数据：先归档历史上已完成但未挂接的轮次，避免与当前轮次混淆
	if err := s.ensureStockHistoryBackfill(ws, ledgerID, stockCode); err != nil {
		return "", err
	}

	history, err := s.stockDao.GetTradeHistory(ws, ledgerID, stockCode)
	if dao.IsNotFound(err) {
		history = &models.StockTradeHistory{
			ID:        util.GetUUID(),
			LedgerID:  ledgerID,
			StockCode: stockCode,
			StockName: stockName,
		}
		if err := s.stockDao.CreateTradeHistory(ws, history); err != nil {
			return "", err
		}
	} else if err != nil {
		return "", err
	} else if history.StockName != stockName {
		if err := s.stockDao.UpdateTradeHistoryName(ws, ledgerID, stockCode, stockName); err != nil {
			return "", err
		}
	}

	count, err := s.stockDao.CountTradeRounds(ws, history.ID)
	if err != nil {
		return "", err
	}
	openedAt, err := s.stockDao.MinUnattachedTradeTime(ws, ledgerID, stockCode)
	if err != nil {
		return "", err
	}
	if openedAt == 0 {
		openedAt = closedAt
	}
	round := &models.StockTradeRound{
		ID:        util.GetUUID(),
		LedgerID:  ledgerID,
		StockCode: stockCode,
		HistoryID: history.ID,
		RoundNo:   count + 1,
		OpenedAt:  openedAt,
		ClosedAt:  closedAt,
	}
	if err := s.stockDao.CreateTradeRound(ws, round); err != nil {
		return "", err
	}
	// 本轮交易此时尚未入库，CreateTrade 末尾会把当前清仓单直接带上 round_id
	if err := s.stockDao.AttachUnattachedTrades(ws, ledgerID, stockCode, round.ID); err != nil {
		return "", err
	}
	return round.ID, nil
}

// ListTradeHistories 返回全部已完成轮次的股票集合（左栏），按最近清仓时间倒序。
func (s *stockServiceImpl) ListTradeHistories(ws *workspace.Workspace, ledgerID string) ([]dto.StockTradeHistoryDto, error) {
	if err := s.ensureTradeHistoryBackfill(ws, ledgerID); err != nil {
		return nil, err
	}
	histories, err := s.stockDao.ListTradeHistories(ws, ledgerID)
	if err != nil {
		return nil, err
	}
	items := make([]dto.StockTradeHistoryDto, 0, len(histories))
	for i := range histories {
		item, err := s.buildHistoryDto(ws, &histories[i])
		if err != nil {
			return nil, err
		}
		items = append(items, item)
	}
	sort.SliceStable(items, func(i, j int) bool {
		return items[i].LastClosedAt > items[j].LastClosedAt
	})
	return items, nil
}

// GetTradeHistoryDetail 返回单只股票的交易历史详情（右栏）：全部轮次 + 每轮交易 + 汇总盈亏。
func (s *stockServiceImpl) GetTradeHistoryDetail(ws *workspace.Workspace, ledgerID string, stockCode string) (*dto.StockTradeHistoryDetailDto, error) {
	history, err := s.stockDao.GetTradeHistory(ws, ledgerID, stockCode)
	if dao.IsNotFound(err) {
		return nil, models.NewNotFound("该股票暂无交易历史")
	}
	if err != nil {
		return nil, err
	}
	rounds, err := s.stockDao.ListTradeRoundsByStock(ws, ledgerID, stockCode)
	if err != nil {
		return nil, err
	}

	detail := &dto.StockTradeHistoryDetailDto{
		ID:        history.ID,
		LedgerID:  history.LedgerID,
		StockCode: history.StockCode,
		StockName: history.StockName,
	}
	var totalPnl, totalBuyCost int64
	for i := range rounds {
		round := &rounds[i]
		trades, err := s.stockDao.ListTradesByRound(ws, round.ID)
		if err != nil {
			return nil, err
		}
		pnl, pnlRate, buyCost := dto.RoundPnl(trades)
		totalPnl += pnl
		totalBuyCost += buyCost
		if round.ClosedAt > detail.LastClosedAt {
			detail.LastClosedAt = round.ClosedAt
		}
		if pnl > 0 {
			detail.WinCount++
		} else if pnl < 0 {
			detail.LossCount++
		}

		items := make([]dto.StockTradeDto, 0, len(trades))
		for j := range trades {
			items = append(items, dto.FromStockTrade(&trades[j]))
		}
		detail.Rounds = append(detail.Rounds, dto.StockTradeRoundDto{
			ID:         round.ID,
			HistoryID:  round.HistoryID,
			RoundNo:    round.RoundNo,
			OpenedAt:   round.OpenedAt,
			ClosedAt:   round.ClosedAt,
			Pnl:        pnl,
			PnlRate:    pnlRate,
			TradeCount: int64(len(trades)),
			Trades:     items,
		})
	}
	detail.RoundCount = int64(len(rounds))
	detail.TotalPnl = totalPnl
	if totalBuyCost > 0 {
		detail.TotalPnlRate = math.Round(float64(totalPnl)/float64(totalBuyCost)*10000) / 100
	}
	return detail, nil
}

// GetTradeHistorySummary 汇总该账本全部已清仓股票：总盈亏、胜负轮次与总轮次。
func (s *stockServiceImpl) GetTradeHistorySummary(ws *workspace.Workspace, ledgerID string) (*dto.StockTradeHistorySummaryDto, error) {
	if err := s.ensureTradeHistoryBackfill(ws, ledgerID); err != nil {
		return nil, err
	}
	histories, err := s.stockDao.ListTradeHistories(ws, ledgerID)
	if err != nil {
		return nil, err
	}

	summary := &dto.StockTradeHistorySummaryDto{}
	var totalBuyCost int64
	for i := range histories {
		summary.StockCount++
		rounds, err := s.stockDao.ListTradeRoundsByStock(ws, ledgerID, histories[i].StockCode)
		if err != nil {
			return nil, err
		}
		for j := range rounds {
			trades, err := s.stockDao.ListTradesByRound(ws, rounds[j].ID)
			if err != nil {
				return nil, err
			}
			pnl, _, buyCost := dto.RoundPnl(trades)
			summary.RoundCount++
			summary.TotalPnl += pnl
			totalBuyCost += buyCost
			if pnl > 0 {
				summary.WinCount++
			} else if pnl < 0 {
				summary.LossCount++
			}
		}
	}
	if totalBuyCost > 0 {
		summary.TotalPnlRate = math.Round(float64(summary.TotalPnl)/float64(totalBuyCost)*10000) / 100
	}
	return summary, nil
}

// buildHistoryDto 汇总单只股票的轮次数、累计盈亏与最近清仓时间。
func (s *stockServiceImpl) buildHistoryDto(ws *workspace.Workspace, history *models.StockTradeHistory) (dto.StockTradeHistoryDto, error) {
	rounds, err := s.stockDao.ListTradeRoundsByStock(ws, history.LedgerID, history.StockCode)
	if err != nil {
		return dto.StockTradeHistoryDto{}, err
	}
	item := dto.StockTradeHistoryDto{
		ID:         history.ID,
		LedgerID:   history.LedgerID,
		StockCode:  history.StockCode,
		StockName:  history.StockName,
		RoundCount: int64(len(rounds)),
		CreatedAt:  history.CreatedAt,
		UpdatedAt:  history.UpdatedAt,
	}
	var totalPnl, totalBuyCost int64
	for i := range rounds {
		trades, err := s.stockDao.ListTradesByRound(ws, rounds[i].ID)
		if err != nil {
			return dto.StockTradeHistoryDto{}, err
		}
		pnl, _, buyCost := dto.RoundPnl(trades)
		totalPnl += pnl
		totalBuyCost += buyCost
		if rounds[i].ClosedAt > item.LastClosedAt {
			item.LastClosedAt = rounds[i].ClosedAt
		}
	}
	item.TotalPnl = totalPnl
	if totalBuyCost > 0 {
		item.TotalPnlRate = math.Round(float64(totalPnl)/float64(totalBuyCost)*10000) / 100
	}
	return item, nil
}

// ensureTradeHistoryBackfill 为有交易记录但尚无历史集合的股票补齐历史（幂等）。
func (s *stockServiceImpl) ensureTradeHistoryBackfill(ws *workspace.Workspace, ledgerID string) error {
	stocks, err := s.stockDao.ListTradeStocks(ws, ledgerID)
	if err != nil {
		return err
	}
	for _, code := range stocks {
		if err := s.ensureStockHistoryBackfill(ws, ledgerID, code); err != nil {
			return err
		}
	}
	return nil
}

// ensureStockHistoryBackfill 把某只股票尚未挂接轮次的存量交易按「建仓 → 清仓」切分并归档。
// 幂等：每次只处理未挂接的交易；全部挂接后直接返回。
func (s *stockServiceImpl) ensureStockHistoryBackfill(ws *workspace.Workspace, ledgerID string, stockCode string) error {
	trades, err := s.stockDao.ListTradesAsc(ws, ledgerID, stockCode)
	if err != nil {
		return err
	}
	unattached := make([]models.StockTrade, 0, len(trades))
	for i := range trades {
		if trades[i].RoundID == "" {
			unattached = append(unattached, trades[i])
		}
	}
	if len(unattached) == 0 {
		return nil
	}

	cycles := deriveTradeCycles(unattached)
	history, err := s.stockDao.GetTradeHistory(ws, ledgerID, stockCode)
	if dao.IsNotFound(err) {
		if len(cycles) == 0 {
			return nil // 尚无完整轮次（在建），不建历史集合
		}
		history = &models.StockTradeHistory{
			ID:        util.GetUUID(),
			LedgerID:  ledgerID,
			StockCode: stockCode,
			StockName: unattached[0].StockName,
		}
		if err := s.stockDao.CreateTradeHistory(ws, history); err != nil {
			return err
		}
	} else if err != nil {
		return err
	}
	if len(cycles) == 0 {
		return nil
	}

	count, err := s.stockDao.CountTradeRounds(ws, history.ID)
	if err != nil {
		return err
	}
	for i := range cycles {
		cycle := &cycles[i]
		round := &models.StockTradeRound{
			ID:        util.GetUUID(),
			LedgerID:  ledgerID,
			StockCode: stockCode,
			HistoryID: history.ID,
			RoundNo:   count + int64(i) + 1,
			OpenedAt:  cycle.openedAt,
			ClosedAt:  cycle.closedAt,
		}
		if err := s.stockDao.CreateTradeRound(ws, round); err != nil {
			return err
		}
		if err := s.stockDao.UpdateTradesRoundID(ws, round.ID, cycle.ids); err != nil {
			return err
		}
	}
	return nil
}

// tradeCycle 一轮「建仓 → 清仓」的原始交易。
type tradeCycle struct {
	ids      []string
	openedAt int64
	closedAt int64
}

// deriveTradeCycles 把按时间升序的交易流切分为完整轮次：持仓数量回到 0 即一轮结束。
// 尚未回到 0 的在建轮次不返回（保持未挂接，待清仓时归档）。
func deriveTradeCycles(trades []models.StockTrade) []tradeCycle {
	var pending []*tradeCycle
	var shares int64
	var current *tradeCycle
	appendTrade := func(t *models.StockTrade) {
		current.ids = append(current.ids, t.ID)
	}
	for i := range trades {
		t := &trades[i]
		switch t.TradeType {
		case models.StockTradeOpen, models.StockTradeAdd:
			if shares == 0 {
				current = &tradeCycle{openedAt: t.TradeTime}
				pending = append(pending, current)
			}
			shares += t.Shares
			appendTrade(t)
		case models.StockTradeReduce, models.StockTradeClose:
			if current == nil {
				current = &tradeCycle{openedAt: t.TradeTime}
				pending = append(pending, current)
			}
			shares -= t.Shares
			if shares < 0 {
				shares = 0
			}
			appendTrade(t)
			if shares == 0 {
				current.closedAt = t.TradeTime
				current = nil
			}
		}
	}
	cycles := make([]tradeCycle, 0, len(pending))
	for _, c := range pending {
		if c.closedAt > 0 {
			cycles = append(cycles, *c)
		}
	}
	return cycles
}

var (
	stockCodePattern  = regexp.MustCompile(`^(60|68|00|30)\d{4}$`)
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

// normalizeStockRecordDate 归一化资金变化的发生日期；空值按当天记录，非法格式直接报错。
func normalizeStockRecordDate(date string) (string, error) {
	if date == "" {
		return time.Now().Format("2006-01-02"), nil
	}
	parsed, err := time.Parse("2006-01-02", date)
	if err != nil {
		return "", models.NewBadRequest("日期格式应为 YYYY-MM-DD")
	}
	return parsed.Format("2006-01-02"), nil
}
