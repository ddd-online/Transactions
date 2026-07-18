package api

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models"
)

func (h *Handlers) serveStaticFile(c *gin.Context) {
	ws := ws(c)
	if ws == nil {
		c.JSON(http.StatusInternalServerError, models.Result{Code: -1, Msg: "workspace not opened"})
		return
	}

	reqPath := c.Param("filepath")
	cleanPath := filepath.Clean(reqPath)

	if strings.Contains(cleanPath, "..") {
		c.AbortWithStatusJSON(http.StatusForbidden, models.Result{Code: -1, Msg: "invalid file path"})
		return
	}

	fullPath := filepath.Join(ws.GetDirectory(), "data", "assets", cleanPath)
	c.File(fullPath)
}
