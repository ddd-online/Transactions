package api

import (
	"math"
	"strconv"

	"github.com/gin-gonic/gin"

	"github.com/transactions/models"
	"github.com/transactions/models/dto"
	"github.com/transactions/service"
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

// POST /api/v1/stock/account/principal/add  body: { ledger_id, amount(分), date?(YYYY-MM-DD) }
func (h *Handlers) addStockPrincipal(c *gin.Context) (any, error) {
	ledgerID, amount, date, err := parseLedgerAmountDate(c)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.AddPrincipalAtDate(ws(c), ledgerID, amount, date)
}

// POST /api/v1/stock/account/withdraw  body: { ledger_id, amount(分), date?(YYYY-MM-DD) }
func (h *Handlers) withdrawStockAccount(c *gin.Context) (any, error) {
	ledgerID, amount, date, err := parseLedgerAmountDate(c)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.AddWithdrawAtDate(ws(c), ledgerID, amount, date)
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

// GET /api/v1/stock/tag-settings?ledger_id=  当前账本可用交易标签设置
func (h *Handlers) getStockTradeTagSettings(c *gin.Context) (any, error) {
	ledgerID, err := requireLedgerID(c)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.GetTradeTags(ws(c), ledgerID)
}

// PUT /api/v1/stock/tag-settings  body: { ledger_id, tags: string[] }  保存交易标签（「分析」不可删除）
func (h *Handlers) updateStockTradeTagSettings(c *gin.Context) (any, error) {
	var req dto.StockTradeTagSettingRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		return nil, models.NewBadRequest("invalid request: " + err.Error())
	}
	return h.StockSvc.SaveTradeTags(ws(c), req.LedgerID, req.Tags)
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

// PUT /api/v1/stock/positions/:code/review  body: { ledger_id, review }
// 持仓期间先写本轮复盘（500 字以内），清仓归档时进入该轮次
func (h *Handlers) updateStockPositionReview(c *gin.Context) (any, error) {
	arg, ok := JsonArg(c)
	if !ok {
		return nil, models.NewBadRequest("parses request failed")
	}
	ledgerID, ok := arg["ledger_id"].(string)
	if !ok || ledgerID == "" {
		return nil, models.NewBadRequest("ledger_id is required")
	}
	review, _ := arg["review"].(string)
	return h.StockSvc.UpdatePositionReview(ws(c), ledgerID, c.Param("code"), review)
}

// GET /api/v1/stock/trades?ledger_id=&stock_code=
func (h *Handlers) listStockTrades(c *gin.Context) (any, error) {
	ledgerID, err := requireLedgerID(c)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.ListTrades(ws(c), ledgerID, c.Query("stock_code"))
}

// GET /api/v1/stock/history?ledger_id=  交易历史集合列表（左栏）
func (h *Handlers) listStockTradeHistory(c *gin.Context) (any, error) {
	ledgerID, err := requireLedgerID(c)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.ListTradeHistories(ws(c), ledgerID)
}

// GET /api/v1/stock/history/detail?ledger_id=&stock_code=  单只股票历史详情（右栏）
func (h *Handlers) getStockTradeHistoryDetail(c *gin.Context) (any, error) {
	ledgerID, err := requireLedgerID(c)
	if err != nil {
		return nil, err
	}
	stockCode := c.Query("stock_code")
	if stockCode == "" {
		return nil, models.NewBadRequest("stock_code is required")
	}
	return h.StockSvc.GetTradeHistoryDetail(ws(c), ledgerID, stockCode)
}

// GET /api/v1/stock/history/summary?ledger_id=  全部股票的交易历史总览
func (h *Handlers) getStockTradeHistorySummary(c *gin.Context) (any, error) {
	ledgerID, err := requireLedgerID(c)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.GetTradeHistorySummary(ws(c), ledgerID)
}

// PUT /api/v1/stock/history/rounds/:id/review  body: { ledger_id, review }  保存某轮次的交易复盘（500字以内）
func (h *Handlers) updateStockRoundReview(c *gin.Context) (any, error) {
	arg, ok := JsonArg(c)
	if !ok {
		return nil, models.NewBadRequest("parses request failed")
	}
	ledgerID, ok := arg["ledger_id"].(string)
	if !ok || ledgerID == "" {
		return nil, models.NewBadRequest("ledger_id is required")
	}
	roundID := c.Param("id")
	review, _ := arg["review"].(string)
	return h.StockSvc.UpdateRoundReview(ws(c), ledgerID, roundID, review)
}

// PUT /api/v1/stock/history/rounds/:id/tag  body: { ledger_id, tag }  保存某轮次的交易标签（分析/打板/尾盘/追涨）
func (h *Handlers) updateStockRoundTag(c *gin.Context) (any, error) {
	arg, ok := JsonArg(c)
	if !ok {
		return nil, models.NewBadRequest("parses request failed")
	}
	ledgerID, ok := arg["ledger_id"].(string)
	if !ok || ledgerID == "" {
		return nil, models.NewBadRequest("ledger_id is required")
	}
	roundID := c.Param("id")
	tag, _ := arg["tag"].(string)
	return h.StockSvc.UpdateRoundTag(ws(c), ledgerID, roundID, tag)
}

// GET /api/v1/stock/statistics?ledger_id=&start_month=&end_month=&recent=&tag=
// 逐笔结算统计；不带筛选参数为全量，start_month/end_month 为时间区间（YYYY-MM，含首尾整月），
// recent 为最近 N 笔（与时间区间互斥），tag 为交易标签（分析/打板/尾盘/追涨，可与时间/最近 N 叠加）。
func (h *Handlers) getStockStatistics(c *gin.Context) (any, error) {
	ledgerID, err := requireLedgerID(c)
	if err != nil {
		return nil, err
	}
	var recent int64
	if rawRecent := c.Query("recent"); rawRecent != "" {
		parsed, err := strconv.ParseInt(rawRecent, 10, 64)
		if err != nil || parsed <= 0 {
			return nil, models.NewBadRequest("recent 必须为正整数")
		}
		recent = parsed
	}
	return h.StockSvc.GetStatisticsRange(ws(c), ledgerID, c.Query("start_month"), c.Query("end_month"), recent, c.Query("tag"))
}

// POST /api/v1/stock/trades
// body: { ledger_id, stock_code, stock_name, trade_type, trade_time(秒), remark, tag?,
//
//	fills: [{ price(元), lots }] }  —— fills 表示一笔委托的多笔成交明细；
//
// 兼容旧调用：只传 price/lots 时等价于单笔成交的委托。返回成交明细数组。
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
	tradeTime, _ := arg["trade_time"].(float64)
	remark, _ := arg["remark"].(string)
	tag, _ := arg["tag"].(string)

	fills, err := parseTradeFills(arg)
	if err != nil {
		return nil, err
	}
	return h.StockSvc.CreateTradeOrder(ws(c), ledgerID, stockCode, stockName, tradeType, fills, int64(tradeTime), remark, tag)
}

// parseTradeFills 解析成交明细：优先 fills 数组，缺省回退到单笔 price/lots。
func parseTradeFills(arg map[string]any) ([]service.TradeFill, error) {
	raw, ok := arg["fills"].([]any)
	if ok && len(raw) > 0 {
		fills := make([]service.TradeFill, 0, len(raw))
		for i := range raw {
			item, ok := raw[i].(map[string]any)
			if !ok {
				return nil, models.NewBadRequest("成交明细格式错误")
			}
			priceYuan, _ := item["price"].(float64)
			lots, _ := item["lots"].(float64)
			fills = append(fills, service.TradeFill{
				PriceCents: int64(math.Round(priceYuan * 100)),
				Lots:       int64(lots),
			})
		}
		return fills, nil
	}

	priceYuan, _ := arg["price"].(float64)
	lots, _ := arg["lots"].(float64)
	return []service.TradeFill{{
		PriceCents: int64(math.Round(priceYuan * 100)),
		Lots:       int64(lots),
	}}, nil
}

// PUT /api/v1/stock/trades/:id  body: { ledger_id, price(元), lots, trade_time(秒)? }
// 编辑一笔成交：按当前费用设置重算所属委托的全部费用，并重放持仓、资金记录与轮次。
func (h *Handlers) updateStockTradeFill(c *gin.Context) (any, error) {
	arg, ok := JsonArg(c)
	if !ok {
		return nil, models.NewBadRequest("parses request failed")
	}
	ledgerID, ok := arg["ledger_id"].(string)
	if !ok || ledgerID == "" {
		return nil, models.NewBadRequest("ledger_id is required")
	}
	tradeID := c.Param("id")
	priceYuan, _ := arg["price"].(float64)
	lots, _ := arg["lots"].(float64)
	tradeTime, _ := arg["trade_time"].(float64)
	return h.StockSvc.UpdateTradeFill(ws(c), ledgerID, tradeID, int64(math.Round(priceYuan*100)), int64(lots), int64(tradeTime))
}

// DELETE /api/v1/stock/trade-orders/:orderId?ledger_id=  删除整笔委托（含全部成交明细）。
func (h *Handlers) deleteStockTradeOrder(c *gin.Context) (any, error) {
	ledgerID, err := requireLedgerID(c)
	if err != nil {
		return nil, err
	}
	if err := h.StockSvc.DeleteTradeOrder(ws(c), ledgerID, c.Param("orderId")); err != nil {
		return nil, err
	}
	return true, nil
}

// POST /api/v1/stock/trades/impact
// body: { ledger_id, action: update_trade|delete_order, trade_id?, order_id?, price?, lots?, trade_time? }
// 预演编辑/删除的影响（不落库），供确认弹窗提示会失效的轮次与复盘。
func (h *Handlers) previewStockTradeChange(c *gin.Context) (any, error) {
	arg, ok := JsonArg(c)
	if !ok {
		return nil, models.NewBadRequest("parses request failed")
	}
	ledgerID, ok := arg["ledger_id"].(string)
	if !ok || ledgerID == "" {
		return nil, models.NewBadRequest("ledger_id is required")
	}
	action, _ := arg["action"].(string)
	tradeID, _ := arg["trade_id"].(string)
	orderID, _ := arg["order_id"].(string)
	priceYuan, _ := arg["price"].(float64)
	lots, _ := arg["lots"].(float64)
	tradeTime, _ := arg["trade_time"].(float64)
	return h.StockSvc.PreviewTradeChange(ws(c), ledgerID, action, tradeID, orderID, int64(math.Round(priceYuan*100)), int64(lots), int64(tradeTime))
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

// parseLedgerAmountDate 从 JSON body 取 ledger_id、amount（单位：分）与可选的发生日期 date。
func parseLedgerAmountDate(c *gin.Context) (string, int64, string, error) {
	arg, ok := JsonArg(c)
	if !ok {
		return "", 0, "", models.NewBadRequest("parses request failed")
	}

	ledgerID, ok := arg["ledger_id"].(string)
	if !ok || ledgerID == "" {
		return "", 0, "", models.NewBadRequest("ledger_id is required")
	}

	amount, ok := arg["amount"].(float64)
	if !ok {
		return "", 0, "", models.NewBadRequest("amount is required")
	}
	date, _ := arg["date"].(string)
	return ledgerID, int64(amount), date, nil
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
