package api

import (
	"net/http"
	"os"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"

	"github.com/billadm/models"
)

// exitOnce 保证重复收到 /api/v1/app/exit 请求时只执行一次退出流程。
var exitOnce sync.Once

// health 是 liveness 探活接口，不依赖工作空间，供 Electron 主进程定时探测。
func (h *Handlers) health(c *gin.Context) {
	c.JSON(http.StatusOK, models.NewResult())
}

func (h *Handlers) exitApp(c *gin.Context) {
	ret := models.NewResult()

	c.JSON(http.StatusOK, ret)

	if flusher, ok := c.Writer.(http.Flusher); ok {
		flusher.Flush()
	}

	exitOnce.Do(func() {
		logrus.Infof("--------- 退出Billadm ---------")
		h.WsMgr.Close()
		time.Sleep(500 * time.Millisecond)
		os.Exit(0)
	})
}
