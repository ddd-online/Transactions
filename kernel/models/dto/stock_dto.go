package dto

import (
	"math"

	"github.com/transactions/models"
)

// StockOverviewDto 股票账户总览（金额单位：分）。
type StockOverviewDto struct {
	Principal           int64   `json:"principal"`           // 本金
	AvailableCash       int64   `json:"availableCash"`       // 可用现金 = 总资产 − 当前持仓成本
	PositionMarketValue int64   `json:"positionMarketValue"` // 持仓市值（持仓模块接入后填充，当前为 0）
	WithdrawnTotal      int64   `json:"withdrawnTotal"`      // 累计支取（Σ 支取事件金额）
	TotalAssets         int64   `json:"totalAssets"`         // 总资产 = 本金 + 总盈亏 − 累计支取
	RealizedPnl         int64   `json:"realizedPnl"`         // 已实现总盈亏（Σ 卖出净盈亏）
	TotalPnlPercent     float64 `json:"totalPnlPercent"`     // 总盈亏占本金百分比（%）
}

// StockFundRecordDto 资金变化记录。
type StockFundRecordDto struct {
	ID           string `json:"id"`
	LedgerID     string `json:"ledgerId"`
	RecordDate   string `json:"recordDate"`
	EventType    string `json:"eventType"`
	EventText    string `json:"eventText"`
	AmountChange int64  `json:"amountChange"`
	CashBalance  int64  `json:"cashBalance"`
	NetPnl       *int64 `json:"netPnl"`
	Remark       string `json:"remark"`
	CreatedAt    int64  `json:"createdAt"`
}

func FromStockFundRecord(r *models.StockFundRecord) StockFundRecordDto {
	return StockFundRecordDto{
		ID:           r.ID,
		LedgerID:     r.LedgerID,
		RecordDate:   r.RecordDate,
		EventType:    r.EventType,
		EventText:    r.EventText,
		AmountChange: r.AmountChange,
		CashBalance:  r.CashBalance,
		NetPnl:       r.NetPnl,
		Remark:       r.Remark,
		CreatedAt:    r.CreatedAt,
	}
}

// StockFundRecordPage 资金变化记录分页结果。
type StockFundRecordPage struct {
	Items    []StockFundRecordDto `json:"items"`
	Total    int64                `json:"total"`
	Page     int                  `json:"page"`
	PageSize int                  `json:"pageSize"`
}

// StockPositionDto 股票持仓。
type StockPositionDto struct {
	ID          string `json:"id"`
	LedgerID    string `json:"ledgerId"`
	StockCode   string `json:"stockCode"`
	StockName   string `json:"stockName"`
	Quantity    int64  `json:"quantity"`    // 持仓数量（股）
	TotalCost   int64  `json:"totalCost"`   // 持仓总成本（分）
	RealizedPnl int64  `json:"realizedPnl"` // 该股累计已实现盈亏（分）
}

func FromStockPosition(p *models.StockPosition) StockPositionDto {
	return StockPositionDto{
		ID:          p.ID,
		LedgerID:    p.LedgerID,
		StockCode:   p.StockCode,
		StockName:   p.StockName,
		Quantity:    p.Quantity,
		TotalCost:   p.TotalCost,
		RealizedPnl: p.RealizedPnl,
	}
}

// StockNameDto 股票名称查询结果。
type StockNameDto struct {
	StockCode string `json:"stockCode"`
	StockName string `json:"stockName"`
}

// StockTradeDto 股票交易记录。
type StockTradeDto struct {
	ID          string `json:"id"`
	LedgerID    string `json:"ledgerId"`
	StockCode   string `json:"stockCode"`
	StockName   string `json:"stockName"`
	TradeType   string `json:"tradeType"`
	RoundID     string `json:"roundId"`
	Price       int64  `json:"price"`       // 成交价（分/股）
	Lots        int64  `json:"lots"`        // 手数
	Shares      int64  `json:"shares"`      // 股数
	Amount      int64  `json:"amount"`      // 成交金额（分）
	Fee         int64  `json:"fee"`         // 交易费用（分）
	Commission  int64  `json:"commission"`  // 佣金（分）
	StampDuty   int64  `json:"stampDuty"`   // 印花税（分，仅卖出）
	TransferFee int64  `json:"transferFee"` // 过户费（分，仅沪市）
	RealizedPnl *int64 `json:"realizedPnl"`
	TradeTime   int64  `json:"tradeTime"`
	Remark      string `json:"remark"`
}

func FromStockTrade(t *models.StockTrade) StockTradeDto {
	return StockTradeDto{
		ID:          t.ID,
		LedgerID:    t.LedgerID,
		StockCode:   t.StockCode,
		StockName:   t.StockName,
		TradeType:   t.TradeType,
		RoundID:     t.RoundID,
		Price:       t.Price,
		Lots:        t.Lots,
		Shares:      t.Shares,
		Amount:      t.Amount,
		Fee:         t.Fee,
		Commission:  t.Commission,
		StampDuty:   t.StampDuty,
		TransferFee: t.TransferFee,
		RealizedPnl: t.RealizedPnl,
		TradeTime:   t.TradeTime,
		Remark:      t.Remark,
	}
}

// StockTradeHistoryDto 股票交易历史集合（左栏列表项）。
// 盈亏与轮次数均为派生值，按需从轮次交易计算。
type StockTradeHistoryDto struct {
	ID           string  `json:"id"`
	LedgerID     string  `json:"ledgerId"`
	StockCode    string  `json:"stockCode"`
	StockName    string  `json:"stockName"`
	RoundCount   int64   `json:"roundCount"`   // 已完成轮次数
	TotalPnl     int64   `json:"totalPnl"`     // 该股累计已实现盈亏（分）
	TotalPnlRate float64 `json:"totalPnlRate"` // 累计盈亏率（%，相对全部建仓成本）
	LastClosedAt int64   `json:"lastClosedAt"` // 最近一次清仓时间
	CreatedAt    int64   `json:"createdAt"`
	UpdatedAt    int64   `json:"updatedAt"`
}

// StockTradeRoundDto 一次完整轮次：从建仓到清仓的全部交易 + 本轮盈亏。
type StockTradeRoundDto struct {
	ID         string          `json:"id"`
	HistoryID  string          `json:"historyId"`
	RoundNo    int64           `json:"roundNo"`
	OpenedAt   int64           `json:"openedAt"`
	ClosedAt   int64           `json:"closedAt"`
	Pnl        int64           `json:"pnl"`     // 本轮盈亏（分）
	PnlRate    float64         `json:"pnlRate"` // 本轮盈亏率（%）
	TradeCount int64           `json:"tradeCount"`
	Trades     []StockTradeDto `json:"trades"`
}

// StockTradeHistoryDetailDto 单只股票的交易历史详情（右栏）。
type StockTradeHistoryDetailDto struct {
	ID           string               `json:"id"`
	LedgerID     string               `json:"ledgerId"`
	StockCode    string               `json:"stockCode"`
	StockName    string               `json:"stockName"`
	RoundCount   int64                `json:"roundCount"`
	TotalPnl     int64                `json:"totalPnl"`
	TotalPnlRate float64              `json:"totalPnlRate"`
	WinCount     int64                `json:"winCount"`  // 盈利轮数
	LossCount    int64                `json:"lossCount"` // 亏损轮数
	LastClosedAt int64                `json:"lastClosedAt"`
	Rounds       []StockTradeRoundDto `json:"rounds"`
}

// StockTradeHistorySummaryDto 交易历史总览：全部已清仓股票的盈亏、胜负与轮次汇总。
type StockTradeHistorySummaryDto struct {
	StockCount   int64   `json:"stockCount"`   // 已清仓股票数
	RoundCount   int64   `json:"roundCount"`   // 总轮次
	WinCount     int64   `json:"winCount"`     // 盈利轮次
	LossCount    int64   `json:"lossCount"`    // 亏损轮次
	TotalPnl     int64   `json:"totalPnl"`     // 总盈亏（分）
	TotalPnlRate float64 `json:"totalPnlRate"` // 总盈亏率（%）
}

// StockStatisticsDto 交易统计总览：本金（供最大回撤占本金比例）与逐笔结算统计点。
// 统计口径：一笔 = 一只股票的一次完整「建仓 → 清仓」（一个已归档轮次），
// 全部股票按清仓时间合成一条结算序列，自第 1 笔起按累计口径逐笔生成统计点。
type StockStatisticsDto struct {
	Principal  int64                     `json:"principal"`  // 当前本金（分）
	RoundCount int64                     `json:"roundCount"` // 已结算笔数（全部已完成轮次）
	Points     []StockStatisticsPointDto `json:"points"`     // 第 1 笔起的统计点（无结算时为空）
}

// StockStatisticsPointDto 一个结算统计点：截至第 N 笔清仓的累计口径指标。
// 金额单位：分；百分比与比率以小数百分比/倍数表示；平均亏损为亏损金额（正数）。
type StockStatisticsPointDto struct {
	Sequence       int64    `json:"sequence"`       // 全局结算序号（第 N 笔）
	ClosedAt       int64    `json:"closedAt"`       // 本统计点的结算时间（该笔清仓时间，Unix 秒）
	StockCode      string   `json:"stockCode"`      // 触发本统计点的股票代码
	StockName      string   `json:"stockName"`      // 触发本统计点的股票名称
	StockRoundNo   int64    `json:"stockRoundNo"`   // 该股第几轮（该股自己的轮次序号）
	Pnl            int64    `json:"pnl"`            // 本笔盈亏（分）
	PnlRate        float64  `json:"pnlRate"`        // 本笔盈亏率（%）
	TradeCount     int64    `json:"tradeCount"`     // 本笔包含的成交笔数（建仓到清仓的全部交易）
	TotalPnl       int64    `json:"totalPnl"`       // 累计盈亏（分）
	WinCount       int64    `json:"winCount"`       // 累计盈利笔数
	LossCount      int64    `json:"lossCount"`      // 累计亏损笔数
	WinRate        float64  `json:"winRate"`        // 胜率（%，盈利笔数 ÷ 总笔数）
	AvgWin         int64    `json:"avgWin"`         // 平均盈利（分，盈利总和 ÷ 盈利笔数）
	AvgLoss        int64    `json:"avgLoss"`        // 平均亏损（分，亏损金额总和 ÷ 亏损笔数，正数）
	PnlRatio       *float64 `json:"pnlRatio"`       // 实际盈亏比（平均盈利 ÷ 平均亏损），尚无亏损样本时为 null
	Expectancy     int64    `json:"expectancy"`     // 期望值（分/笔，胜率 × 平均盈利 − 亏损率 × 平均亏损）
	MaxDrawdown    int64    `json:"maxDrawdown"`    // 最大回撤（分，当时总资产从高点到低点的最大跌幅）
	MaxDrawdownPct float64  `json:"maxDrawdownPct"` // 最大回撤占当时本金比例（%）
}

// RoundPnl 由一轮交易推导本轮盈亏与盈亏率（不存储冗余派生值）。
// 买入成本 = Σ(成交金额 + 费用)；卖出净额 = Σ(成交金额 - 费用)；盈亏 = 卖出净额 - 买入成本。
func RoundPnl(trades []models.StockTrade) (pnl int64, pnlRate float64, buyCost int64) {
	for i := range trades {
		t := &trades[i]
		switch t.TradeType {
		case models.StockTradeOpen, models.StockTradeAdd:
			buyCost += t.Amount + t.Fee
		case models.StockTradeReduce, models.StockTradeClose:
			pnl += t.Amount - t.Fee
		}
	}
	pnl -= buyCost
	if buyCost > 0 {
		pnlRate = math.Round(float64(pnl)/float64(buyCost)*10000) / 100
	}
	return pnl, pnlRate, buyCost
}
