package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models"
	"github.com/billadm/service"
	"github.com/billadm/workspace"
)

// GET /api/v1/key-events/year/:year
func listKeyEventsByYear(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	year := c.Param("year")
	if year == "" {
		ret.Code = -1
		ret.Msg = "missing year parameter"
		return
	}

	events, err := service.GetKeyEventService().QueryByYear(ws, year)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = events
}

// GET /api/v1/key-events/dates/:year
func listKeyEventDates(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	year := c.Param("year")
	if year == "" {
		ret.Code = -1
		ret.Msg = "missing year parameter"
		return
	}

	dates, err := service.GetKeyEventService().QueryDatesByYear(ws, year)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = dates
}

// GET /api/v1/key-events/:date
func getKeyEvent(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	date := c.Param("date")
	if date == "" {
		ret.Code = -1
		ret.Msg = "missing date parameter"
		return
	}

	event, err := service.GetKeyEventService().QueryByDate(ws, date)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = event
}

// POST /api/v1/key-events  body: { date, title, content }
func upsertKeyEvent(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	arg, ok := JsonArg(c, ret)
	if !ok {
		return
	}

	date, ok := arg["date"].(string)
	if !ok {
		ret.Code = -1
		ret.Msg = "date is required"
		return
	}

	title, _ := arg["title"].(string)
	content, _ := arg["content"].(string)
	color, _ := arg["color"].(string)

	if err := service.GetKeyEventService().UpsertKeyEvent(ws, date, title, content, color); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = date
}

// DELETE /api/v1/key-events/:date
func deleteKeyEvent(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	date := c.Param("date")
	if date == "" {
		ret.Code = -1
		ret.Msg = "missing date parameter"
		return
	}

	if err := service.GetKeyEventService().DeleteByDate(ws, date); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

// GET /api/v1/key-events/:date/images
func listKeyEventImages(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	date := c.Param("date")
	if date == "" {
		ret.Code = -1
		ret.Msg = "missing date parameter"
		return
	}

	images, err := service.GetKeyEventImageService().GetImagesByEventDate(ws, date)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = images
}

// POST /api/v1/key-events/:date/images  body: { data, filename }
func addKeyEventImage(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	date := c.Param("date")
	if date == "" {
		ret.Code = -1
		ret.Msg = "missing date parameter"
		return
	}

	arg, ok := JsonArg(c, ret)
	if !ok {
		return
	}

	data, ok := arg["data"].(string)
	if !ok || data == "" {
		ret.Code = -1
		ret.Msg = "invalid image data"
		return
	}

	filename, _ := arg["filename"].(string)

	image, err := service.GetKeyEventImageService().AddImage(ws, date, data, filename)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = image.ID
}

// DELETE /api/v1/key-event-images/:id
func deleteKeyEventImage(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	imageId := c.Param("id")
	if imageId == "" {
		ret.Code = -1
		ret.Msg = "missing image id parameter"
		return
	}

	if err := service.GetKeyEventImageService().DeleteImage(ws, imageId); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}