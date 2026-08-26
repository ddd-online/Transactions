package api

import (
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
