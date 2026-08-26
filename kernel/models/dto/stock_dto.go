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
