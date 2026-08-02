package api_test

import (
	"testing"

	"github.com/billadm/api"
	"github.com/gin-gonic/gin"
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
