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

	baseDir := filepath.Join(ws.GetDirectory(), "data", "assets")
	fullPath := filepath.Join(baseDir, cleanPath)

	// Resolve symlinks and verify path stays within base directory
	resolved, err := filepath.Abs(fullPath)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusForbidden, models.Result{Code: -1, Msg: "invalid file path"})
		return
	}
	absBase, err := filepath.Abs(baseDir)
	if err != nil {
		c.AbortWithStatusJSON(http.StatusForbidden, models.Result{Code: -1, Msg: "invalid file path"})
		return
	}
	if !strings.HasPrefix(resolved, absBase+string(filepath.Separator)) && resolved != absBase {
		c.AbortWithStatusJSON(http.StatusForbidden, models.Result{Code: -1, Msg: "invalid file path"})
		return
	}

	c.File(resolved)
}
