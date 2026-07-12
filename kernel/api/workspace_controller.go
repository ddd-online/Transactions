package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models"
)

// POST /workspace
func (h *Handlers) openWorkspace(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	arg, ok := JsonArg(c)
	if !ok {
		ret.Code = -1
		ret.Msg = "parses request failed"
		return
	}

	workspaceDir, ok := arg["workspaceDir"].(string)
	if !ok || workspaceDir == "" {
		ret.Code = -1
		ret.Msg = "工作目录路径不能为空"
		return
	}

	err := h.WsMgr.OpenWorkspace(workspaceDir)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}
