package api_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"

	"github.com/transactions/api"
	"github.com/transactions/models/dto"
	"github.com/transactions/server"
	"github.com/transactions/workspace"
)

type apiEnvelope struct {
	Code int             `json:"code"`
	Msg  string          `json:"msg"`
	Data json.RawMessage `json:"data"`
}

// newStockAPIServer 启动一个接入了真实服务的工作空间 + 路由，返回路由与测试账本 ID。
func newStockAPIServer(t *testing.T) (*gin.Engine, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	mgr := workspace.NewWsManager()
	if err := mgr.OpenWorkspace(t.TempDir()); err != nil {
		t.Fatalf("打开工作空间失败: %v", err)
	}
	t.Cleanup(mgr.Close)

	engine := gin.New()
	api.ServeAPI(engine, server.InitServices(mgr))

	// CreateLedger 的 data 即账本 ID
	var ledgerID string
	callAPI(t, engine, http.MethodPost, "/api/v1/ledgers", map[string]any{"name": "委托测试"}, &ledgerID)
	if ledgerID == "" {
		t.Fatal("创建账本失败：缺少 ID")
	}
	return engine, ledgerID
}

// callAPI 发起一次 JSON 请求并校验 {code,msg,data} 信封，out 非空时反序列化 data。
func callAPI(t *testing.T, engine *gin.Engine, method string, path string, body any, out any) {
	t.Helper()
	var payload []byte
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			t.Fatalf("序列化请求失败: %v", err)
		}
		payload = encoded
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(payload))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	engine.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("%s %s HTTP %d: %s", method, path, rec.Code, rec.Body.String())
	}

	var result apiEnvelope
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("%s %s 解析响应失败: %v (%s)", method, path, err, rec.Body.String())
	}
	if result.Code != 0 {
		t.Fatalf("%s %s 业务失败: %s", method, path, result.Msg)
	}
	if out != nil {
		if err := json.Unmarshal(result.Data, out); err != nil {
			t.Fatalf("%s %s 解析 data 失败: %v (%s)", method, path, err, string(result.Data))
		}
	}
}

// 端到端：一笔委托两笔成交 → 费用按委托计算一次、明细保留、盈亏 -297.81；
// 预演不落库；编辑单笔与删除整笔委托都能正确重算。
func TestStockTradeOrderAPI(t *testing.T) {
	engine, ledgerID := newStockAPIServer(t)

	// 本金 10 万元
	callAPI(t, engine, http.MethodPost, "/api/v1/stock/account/principal",
		map[string]any{"ledger_id": ledgerID, "amount": 10000000}, nil)

	// 建仓 200 股 @38.06
	callAPI(t, engine, http.MethodPost, "/api/v1/stock/trades", map[string]any{
		"ledger_id":  ledgerID,
		"stock_code": "605258",
		"stock_name": "协和电子",
		"trade_type": "open",
		"fills":      []map[string]any{{"price": 38.06, "lots": 2}},
		"trade_time": 1700000000,
	}, nil)

	// 同一委托卖出 100@36.67 + 100@36.61
	var fills []dto.StockTradeDto
	callAPI(t, engine, http.MethodPost, "/api/v1/stock/trades", map[string]any{
		"ledger_id":  ledgerID,
		"stock_code": "605258",
		"stock_name": "协和电子",
		"trade_type": "close",
		"fills": []map[string]any{
			{"price": 36.67, "lots": 1},
			{"price": 36.61, "lots": 1},
		},
		"trade_time": 1700000100,
	}, &fills)

	if len(fills) != 2 {
		t.Fatalf("应返回 2 笔成交明细, 实际 %d", len(fills))
	}
	if fills[0].OrderID == "" || fills[0].OrderID != fills[1].OrderID {
		t.Fatalf("同一委托应共用 orderId: %+v", fills)
	}
	if fills[0].OrderSeq != 1 || fills[1].OrderSeq != 2 {
		t.Fatalf("成交序号错误: %d/%d", fills[0].OrderSeq, fills[1].OrderSeq)
	}
	if fills[0].Price != 3667 || fills[1].Price != 3661 {
		t.Fatalf("成交明细应保留各自成交价: %d/%d", fills[0].Price, fills[1].Price)
	}
	var fee, realized int64
	for i := range fills {
		fee += fills[i].Fee
		if fills[i].RealizedPnl != nil {
			realized += *fills[i].RealizedPnl
		}
	}
	if fee != 873 {
		t.Fatalf("卖出委托费用应为 873 分（佣金 500 + 印花税 366 + 过户费 7）, 实际 %d", fee)
	}
	if realized != -29781 {
		t.Fatalf("已实现盈亏应为 -29781 分, 实际 %d", realized)
	}

	// 交易历史按轮次归档，本轮盈亏与明细一致
	var detail dto.StockTradeHistoryDetailDto
	callAPI(t, engine, http.MethodGet,
		"/api/v1/stock/history/detail?ledger_id="+ledgerID+"&stock_code=605258", nil, &detail)
	if detail.TotalPnl != -29781 {
		t.Fatalf("该股总盈亏应为 -29781 分, 实际 %d", detail.TotalPnl)
	}
	if len(detail.Rounds) != 1 || len(detail.Rounds[0].Trades) != 3 {
		t.Fatalf("本轮应包含 3 笔成交（1 买 2 卖）: %+v", detail.Rounds)
	}

	// 预演删除整笔委托：不落库，并提示第 1 轮失效
	var impact dto.StockTradeImpactDto
	callAPI(t, engine, http.MethodPost, "/api/v1/stock/trades/impact", map[string]any{
		"ledger_id": ledgerID,
		"action":    "delete_order",
		"order_id":  fills[0].OrderID,
	}, &impact)
	if impact.PositionAfter != 200 || len(impact.RemovedRounds) != 1 {
		t.Fatalf("预演结果错误: %+v", impact)
	}
	var afterPreview []dto.StockTradeDto
	callAPI(t, engine, http.MethodGet,
		"/api/v1/stock/trades?ledger_id="+ledgerID+"&stock_code=605258", nil, &afterPreview)
	if len(afterPreview) != 3 {
		t.Fatalf("预演不应改变数据, 实际剩余 %d 笔", len(afterPreview))
	}

	// 编辑第二笔成交价：按委托总额重算费用
	var updated dto.StockTradeDto
	callAPI(t, engine, http.MethodPut, "/api/v1/stock/trades/"+fills[1].ID, map[string]any{
		"ledger_id":  ledgerID,
		"price":      36.61,
		"lots":       1,
		"trade_time": 1700000100,
	}, &updated)
	if updated.Price != 3661 {
		t.Fatalf("编辑后成交价错误: %d", updated.Price)
	}

	// 删除整笔委托：持仓回到 200 股，卖出成交与资金记录一并回滚
	callAPI(t, engine, http.MethodDelete,
		"/api/v1/stock/trade-orders/"+fills[0].OrderID+"?ledger_id="+ledgerID, nil, nil)

	var positions []dto.StockPositionDto
	callAPI(t, engine, http.MethodGet, "/api/v1/stock/positions?ledger_id="+ledgerID, nil, &positions)
	if len(positions) != 1 || positions[0].Quantity != 200 {
		t.Fatalf("删除后应回到 200 股持仓: %+v", positions)
	}
	var remaining []dto.StockTradeDto
	callAPI(t, engine, http.MethodGet,
		"/api/v1/stock/trades?ledger_id="+ledgerID+"&stock_code=605258", nil, &remaining)
	if len(remaining) != 1 || remaining[0].TradeType != "open" {
		t.Fatalf("删除后应只剩建仓一笔: %+v", remaining)
	}
}
