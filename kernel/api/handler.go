package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

// Handle wraps a handler function that returns (data, error) into a gin.HandlerFunc.
// It creates the Result envelope, writes data on success or error message on failure,
// and defers the JSON response.
func Handle(fn func(c *gin.Context) (any, error)) gin.HandlerFunc {
	return func(c *gin.Context) {
		ret := models.NewResult()
		defer c.JSON(http.StatusOK, ret)

		data, err := fn(c)
		if err != nil {
			ret.Code = -1
			ret.Msg = err.Error()
			return
		}
		ret.Data = data
	}
}

// ws returns the opened workspace. Must only be called after RequireWorkspace middleware.
func ws(c *gin.Context) *workspace.Workspace {
	return workspace.Manager.OpenedWorkspace()
}

// RequireWorkspace returns a middleware that rejects requests with a 500 error
// if no workspace has been opened.
func RequireWorkspace() gin.HandlerFunc {
	return func(c *gin.Context) {
		ws := workspace.Manager.OpenedWorkspace()
		if ws == nil {
			c.JSON(http.StatusInternalServerError, models.Result{
				Code: -1,
				Msg:  workspace.ErrOpenedWorkspaceNotFound,
			})
			c.Abort()
			return
		}
		c.Next()
	}
}
