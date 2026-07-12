package api

import (
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"

	"github.com/billadm/models"
)

func (h *Handlers) exitApp(c *gin.Context) {
	ret := models.NewResult()

	c.JSON(http.StatusOK, ret)

	if flusher, ok := c.Writer.(http.Flusher); ok {
		flusher.Flush()
	}

	go func() {
		logrus.Infof("--------- 退出Billadm ---------")
		h.WsMgr.Close()
		time.Sleep(500 * time.Millisecond)
		os.Exit(0)
	}()
}
