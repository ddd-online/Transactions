package api_test

import (
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/transactions/api"
)

// TestServeAPIRegistersDiaryExport 冒烟测试：路由注册本身不应 panic（gin 对
// 同名通配符冲突会在注册时直接 panic），且 /diary/export 必须存在。
func TestServeAPIRegistersDiaryExport(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api.ServeAPI(r, &api.Handlers{})

	for _, route := range r.Routes() {
		if route.Method == "POST" && route.Path == "/api/v1/diary/export" {
			return
		}
	}
	t.Fatal("未注册 POST /api/v1/diary/export")
}

// TestServeAPIRegistersHealth 冒烟测试：健康检查接口必须注册，且不依赖工作空间。
func TestServeAPIRegistersHealth(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api.ServeAPI(r, &api.Handlers{})

	for _, route := range r.Routes() {
		if route.Method == "GET" && route.Path == "/api/v1/health" {
			return
		}
	}
	t.Fatal("未注册 GET /api/v1/health")
}

// TestServeAPIRegistersStockTradeRoutes 冒烟测试：委托多笔成交相关的编辑/删除/预演路由必须注册
// （gin 对同方法下通配符与静态路径冲突会在注册时 panic）。
func TestServeAPIRegistersStockTradeRoutes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	api.ServeAPI(r, &api.Handlers{})

	want := map[string]bool{
		"POST /api/v1/stock/trades":                  false,
		"PUT /api/v1/stock/trades/:id":               false,
		"DELETE /api/v1/stock/trade-orders/:orderId": false,
		"POST /api/v1/stock/trades/impact":           false,
	}
	for _, route := range r.Routes() {
		key := route.Method + " " + route.Path
		if _, ok := want[key]; ok {
			want[key] = true
		}
	}
	for key, found := range want {
		if !found {
			t.Fatalf("未注册路由 %s", key)
		}
	}
}
