package server

import (
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"

	"github.com/billadm/util"
)

// slowRequestThreshold 超过该耗时的请求按 Warn 记录，便于定位性能回归。
const slowRequestThreshold = 200 * time.Millisecond

// requestLogger 为每个请求生成 request-id（透传调用方传入的 X-Request-ID），
// 并记录方法、路径、状态码与耗时。慢请求单独以 Warn 级别输出。
func requestLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		start := time.Now()
		reqID := c.GetHeader("X-Request-ID")
		if reqID == "" {
			reqID = util.GetUUID()
		}
		c.Header("X-Request-ID", reqID)

		c.Next()

		latency := time.Since(start)
		line := logrus.Infof
		level := "INFO"
		if latency > slowRequestThreshold {
			line = logrus.Warnf
			level = "WARN"
		}
		line("[%s] %s %s %s -> %d (%dms)",
			level, reqID, c.Request.Method, c.Request.URL.Path, c.Writer.Status(), latency.Milliseconds())
	}
}
