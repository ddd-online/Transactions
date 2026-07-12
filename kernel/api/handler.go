package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

const ctxWorkspaceKey = "billadm_workspace"

// Handle wraps a handler function that returns (data, error) into a gin.HandlerFunc.
// It creates the Result envelope, writes data on success or error message on failure,
// and defers the JSON response. If the error is an *models.AppError, the HTTP status
// code is taken from it; otherwise defaults to 500.
func Handle(fn func(c *gin.Context) (any, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		ret := models.NewResult()

		data, err := fn(c)
		if err != nil {
			ret.Code = -1
			ret.Msg = err.Error()
			status := http.StatusInternalServerError
			if ae := models.AsAppError(err); ae != nil {
				status = ae.Status
			}
			c.JSON(status, ret)
			return
		}
		ret.Data = data
		c.JSON(http.StatusOK, ret)
	}
}

// ws returns the opened workspace from the gin context.
// Must only be called after RequireWorkspace middleware.
func ws(c *gin.Context) *workspace.Workspace {
	val, _ := c.Get(ctxWorkspaceKey)
	if val == nil {
		return nil
	}
	return val.(*workspace.Workspace)
}

// RequireWorkspace returns a middleware that rejects requests with a 500 error
// if no workspace has been opened.
func RequireWorkspace(mgr *workspace.WsManager) gin.HandlerFunc {
	return func(c *gin.Context) {
		ws := mgr.OpenedWorkspace()
		if ws == nil {
			c.JSON(http.StatusInternalServerError, models.Result{
				Code: -1,
				Msg:  workspace.ErrOpenedWorkspaceNotFound,
			})
			c.Abort()
			return
		}
		c.Set(ctxWorkspaceKey, ws)
		c.Next()
	}
}
