package api

import (
	"math"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/transactions/models"
)

// GET /api/v1/stock/account/overview?ledger_id=
func (h *Handlers) getStockOverview(c *gin.Context) (any, error) {
	ledgerID, err := requireLedgerID(c)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.GetOverview(ws(c), ledgerID)
}

// POST /api/v1/stock/account/principal  body: { ledger_id, amount(分) }
func (h *Handlers) setStockPrincipal(c *gin.Context) (any, error) {
	ledgerID, amount, err := parseLedgerAndAmount(c)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.SetPrincipal(ws(c), ledgerID, amount)
}

// POST /api/v1/stock/account/principal/add  body: { ledger_id, amount(分) }
func (h *Handlers) addStockPrincipal(c *gin.Context) (any, error) {
	ledgerID, amount, err := parseLedgerAndAmount(c)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.AddPrincipal(ws(c), ledgerID, amount)
}

// GET /api/v1/stock/account/fee-settings?ledger_id=
func (h *Handlers) getStockFeeSettings(c *gin.Context) (any, error) {
	ledgerID, err := requireLedgerID(c)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.GetFeeSettings(ws(c), ledgerID)
}

// PUT /api/v1/stock/account/fee-settings  body: { ledger_id, commission_rate, min_commission(分), stamp_duty_rate, transfer_fee_rate }
func (h *Handlers) updateStockFeeSettings(c *gin.Context) (any, error) {
	ws := ws(c)

	arg, ok := JsonArg(c)
	if !ok {
		return nil, models.NewBadRequest("parses request failed")
	}

	ledgerID, ok := arg["ledger_id"].(string)
	if !ok || ledgerID == "" {
		return nil, models.NewBadRequest("ledger_id is required")
	}

	commissionRate, ok := arg["commission_rate"].(float64)
	if !ok {
		return nil, models.NewBadRequest("commission_rate is required")
	}
	stampDutyRate, _ := arg["stamp_duty_rate"].(float64)
	transferFeeRate, _ := arg["transfer_fee_rate"].(float64)
	minCommission, _ := arg["min_commission"].(float64)

	return h.StockSvc.SaveFeeSettings(ws, ledgerID, commissionRate, int64(minCommission), stampDutyRate, transferFeeRate)
}

// GET /api/v1/stock/account/fund-records?ledger_id=&page=&page_size=
func (h *Handlers) listStockFundRecords(c *gin.Context) (any, error) {
	ledgerID, err := requireLedgerID(c)
	if err != nil {
		return nil, err
	}

	page := parsePositiveInt(c.Query("page"), 1)
	pageSize := parsePositiveInt(c.Query("page_size"), 10)
	return h.StockSvc.ListFundRecords(ws(c), ledgerID, page, pageSize)
}

// GET /api/v1/stock/positions?ledger_id=
func (h *Handlers) getStockPositions(c *gin.Context) (any, error) {
	ledgerID, err := requireLedgerID(c)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.ListPositions(ws(c), ledgerID)
}

// GET /api/v1/stock/trades?ledger_id=&stock_code=
func (h *Handlers) listStockTrades(c *gin.Context) (any, error) {
	ledgerID, err := requireLedgerID(c)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.ListTrades(ws(c), ledgerID, c.Query("stock_code"))
}

// POST /api/v1/stock/trades  body: { ledger_id, stock_code, stock_name, trade_type, price(元), lots, trade_time(秒), remark }
func (h *Handlers) createStockTrade(c *gin.Context) (any, error) {
	arg, ok := JsonArg(c)
	if !ok {
		return nil, models.NewBadRequest("parses request failed")
	}
	ledgerID, ok := arg["ledger_id"].(string)
	if !ok || ledgerID == "" {
		return nil, models.NewBadRequest("ledger_id is required")
	}
	stockCode, _ := arg["stock_code"].(string)
	if stockCode == "" {
		return nil, models.NewBadRequest("stock_code is required")
	}
	stockName, _ := arg["stock_name"].(string)
	tradeType, _ := arg["trade_type"].(string)
	priceYuan, _ := arg["price"].(float64)
	lots, _ := arg["lots"].(float64)
	tradeTime, _ := arg["trade_time"].(float64)
	remark, _ := arg["remark"].(string)

	priceCents := int64(math.Round(priceYuan * 100))
	return h.StockSvc.CreateTrade(ws(c), ledgerID, stockCode, stockName, tradeType, priceCents, int64(lots), int64(tradeTime), remark)
}

// GET /api/v1/stock/name?stock_code=
func (h *Handlers) getStockName(c *gin.Context) (any, error) {
	return h.StockSvc.LookupStockName(ws(c), c.Query("stock_code"))
}

// POST /api/v1/stock/reset  body: { ledger_id }  清空指定账本的全部股票交易数据。
func (h *Handlers) resetStockData(c *gin.Context) (any, error) {
	arg, ok := JsonArg(c)
	if !ok {
		return nil, models.NewBadRequest("parses request failed")
	}
	ledgerID, ok := arg["ledger_id"].(string)
	if !ok || ledgerID == "" {
		return nil, models.NewBadRequest("ledger_id is required")
	}
	if err := h.StockSvc.ResetData(ws(c), ledgerID); err != nil {
		return nil, err
	}
	return true, nil
}

// requireLedgerID 从 query 取 ledger_id。
func requireLedgerID(c *gin.Context) (string, error) {
	ledgerID := c.Query("ledger_id")
	if ledgerID == "" {
		return "", models.NewBadRequest("ledger_id is required")
	}
	return ledgerID, nil
}

// parseLedgerAndAmount 从 JSON body 取 ledger_id 与 amount（单位：分，整数）。
func parseLedgerAndAmount(c *gin.Context) (string, int64, error) {
	arg, ok := JsonArg(c)
	if !ok {
		return "", 0, models.NewBadRequest("parses request failed")
	}

	ledgerID, ok := arg["ledger_id"].(string)
	if !ok || ledgerID == "" {
		return "", 0, models.NewBadRequest("ledger_id is required")
	}

	amount, ok := arg["amount"].(float64)
	if !ok {
		return "", 0, models.NewBadRequest("amount is required")
	}
	return ledgerID, int64(amount), nil
}

// parsePositiveInt 解析正整数 query 参数，非法或缺失时返回默认值。
func parsePositiveInt(raw string, def int) int {
	if raw == "" {
		return def
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 1 {
		return def
	}
	return n
}
