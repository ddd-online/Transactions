package server

import (
	"strings"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"

	"github.com/billadm/util"
)

func NewGinServer() *gin.Engine {
	server := gin.Default()
	// cors
	server.Use(cors.New(cors.Config{
		AllowOrigins:     []string{"*"},                                                // 允许的源
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"}, // 允许的HTTP方法
		AllowHeaders:     []string{"Origin", "Content-Length", "Content-Type"},         // 允许的头部信息
		ExposeHeaders:    []string{"Content-Length"},                                   // 暴露的头部信息
		AllowCredentials: true,                                                         // 是否允许发送Cookie
		MaxAge:           12 * time.Hour,                                               // 预检请求的有效期
	}))

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
