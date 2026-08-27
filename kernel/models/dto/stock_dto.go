package dto

import "github.com/transactions/models"

// StockOverviewDto 股票账户总览（金额单位：分）。
type StockOverviewDto struct {
	Principal           int64   `json:"principal"`           // 本金
	CurrentCash         int64   `json:"currentCash"`         // 当前现金（末条资金记录余额，无记录时=本金）
	PositionMarketValue int64   `json:"positionMarketValue"` // 持仓市值（持仓模块接入后填充，当前为 0）
	TotalAssets         int64   `json:"totalAssets"`         // 总资产 = 当前现金 + 持仓市值
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
	AvgCost     int64  `json:"avgCost"`     // 平均成本（分/股，含买入费用）
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
		AvgCost:     p.AvgCost,
		TotalCost:   p.TotalCost,
		RealizedPnl: p.RealizedPnl,
	}
}

// StockTradeDto 股票交易记录。
type StockTradeDto struct {
	ID          string `json:"id"`
	LedgerID    string `json:"ledgerId"`
	StockCode   string `json:"stockCode"`
	StockName   string `json:"stockName"`
	TradeType   string `json:"tradeType"`
	Price       int64  `json:"price"`  // 成交价（分/股）
	Lots        int64  `json:"lots"`   // 手数
	Shares      int64  `json:"shares"` // 股数
	Amount      int64  `json:"amount"` // 成交金额（分）
	Fee         int64  `json:"fee"`    // 交易费用（分）
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
		Price:       t.Price,
		Lots:        t.Lots,
		Shares:      t.Shares,
		Amount:      t.Amount,
		Fee:         t.Fee,
		RealizedPnl: t.RealizedPnl,
		TradeTime:   t.TradeTime,
		Remark:      t.Remark,
	}
}

// StockJournalDto 股票交易日志。
type StockJournalDto struct {
	ID        string `json:"id"`
	LedgerID  string `json:"ledgerId"`
	StockCode string `json:"stockCode"`
	StockName string `json:"stockName"`
	Rules     string `json:"rules"`
	Plan      string `json:"plan"`
	Review    string `json:"review"`
}

func FromStockJournal(j *models.StockJournal) StockJournalDto {
	return StockJournalDto{
		ID:        j.ID,
		LedgerID:  j.LedgerID,
		StockCode: j.StockCode,
		StockName: j.StockName,
		Rules:     j.Rules,
		Plan:      j.Plan,
		Review:    j.Review,
	}
}
