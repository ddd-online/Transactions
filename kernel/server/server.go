package server

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/transactions/util"
)

func NewGinServer(apiToken string) *gin.Engine {
	server := gin.New()
	server.Use(gin.Recovery())
	// cors
	// 仅放行本地开发时的 Vite 前端源；生产环境前后端同源，本就不需要 CORS。
	// 之前的 AllowOrigins:["*"] + AllowCredentials:true 会让任意网页跨域读取本地财务数据。
	server.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"http://localhost:38080", "http://127.0.0.1:38080"},
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type", "X-Api-Token"},
		ExposeHeaders:    []string{"Content-Length"},
		AllowCredentials: false,
		MaxAge:           12 * time.Hour,
	}))
	// API 令牌鉴权（生产环境由 Electron 注入随机令牌，本地开发令牌为空则跳过）
	server.Use(apiTokenAuth(apiToken))

	// 静态文件缓存控制：index.html 禁止缓存，带 hash 的 assets 长期缓存
	distDir := util.GetDistDir()
	server.Use(func(c *gin.Context) {
		if strings.HasPrefix(c.Request.URL.Path, "/static/") {
			path := c.Request.URL.Path
			if strings.HasSuffix(path, ".html") {
				// HTML 入口文件禁止缓存，确保升级后前端立即生效
				c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
				c.Header("Pragma", "no-cache")
				c.Header("Expires", "0")
			} else if strings.Contains(path, "/assets/") {
				// 带 hash 的资源文件可以长期缓存
				c.Header("Cache-Control", "public, max-age=31536000, immutable")
			}
		}
		c.Next()
	})
	server.Static("/static", distDir)
	return server
}

// apiTokenAuth 校验 X-Api-Token 请求头。令牌为空时跳过（本地开发 go run 无令牌）。
// 仅保护 /api/ 下的接口；/api/v1/health 由 Electron 主进程探活使用，保持无鉴权；
// 静态资源（/static/*）必须无鉴权，否则页面无法加载以获取令牌。
func apiTokenAuth(apiToken string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if apiToken == "" {
			c.Next()
			return
		}
		p := c.Request.URL.Path
		// health 供 Electron 探活；static 是 <img> 直接加载的图片，无法携带请求头，均免鉴权
		if !strings.HasPrefix(p, "/api/") || p == "/api/v1/health" || strings.HasPrefix(p, "/api/v1/static/") {
			c.Next()
			return
		}
		if c.Request.Method == http.MethodOptions {
			c.Next()
			return
		}
		if c.GetHeader("X-Api-Token") != apiToken {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"code": -1, "msg": "unauthorized"})
			return
		}
		c.Next()
	}
}
