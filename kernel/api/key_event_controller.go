package api

import (
	"fmt"

	"github.com/gin-gonic/gin"
)

// GET /api/v1/key-events/year/:year
func (h *Handlers) listKeyEventsByYear(c *gin.Context) (any, error) {
	ws := ws(c)

	year := c.Param("year")
	if year == "" {
		return nil, fmt.Errorf("missing year parameter")
	}

	ledgerID := c.Query("ledger_id")
	if ledgerID == "" {
		return nil, fmt.Errorf("ledger_id is required")
	}

	return h.KeyEventSvc.QueryByYear(ws, ledgerID, year)
}

// GET /api/v1/key-events/dates/:year
func (h *Handlers) listKeyEventDates(c *gin.Context) (any, error) {
	ws := ws(c)

	year := c.Param("year")
	if year == "" {
		return nil, fmt.Errorf("missing year parameter")
	}

	ledgerID := c.Query("ledger_id")
	if ledgerID == "" {
		return nil, fmt.Errorf("ledger_id is required")
	}

	return h.KeyEventSvc.QueryDatesByYear(ws, ledgerID, year)
}

// GET /api/v1/key-events/:date
func (h *Handlers) getKeyEvent(c *gin.Context) (any, error) {
	ws := ws(c)

	date := c.Param("date")
	if date == "" {
		return nil, fmt.Errorf("missing date parameter")
	}

	ledgerID := c.Query("ledger_id")
	if ledgerID == "" {
		return nil, fmt.Errorf("ledger_id is required")
	}

	return h.KeyEventSvc.QueryByDate(ws, ledgerID, date)
}

// POST /api/v1/key-events  body: { date, title, content }
func (h *Handlers) upsertKeyEvent(c *gin.Context) (any, error) {
	ws := ws(c)

	arg, ok := JsonArg(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}

	ledgerID, ok := arg["ledger_id"].(string)
	if !ok || ledgerID == "" {
		return nil, fmt.Errorf("ledger_id is required")
	}

	date, ok := arg["date"].(string)
	if !ok {
		return nil, fmt.Errorf("date is required")
	}

	title, _ := arg["title"].(string)
	content, _ := arg["content"].(string)
	color, _ := arg["color"].(string)

	if err := h.KeyEventSvc.UpsertKeyEvent(ws, ledgerID, date, title, content, color); err != nil {
		return nil, err
	}
	return date, nil
}

// DELETE /api/v1/key-events/:date
func (h *Handlers) deleteKeyEvent(c *gin.Context) (any, error) {
	ws := ws(c)

	date := c.Param("date")
	if date == "" {
		return nil, fmt.Errorf("missing date parameter")
	}

	ledgerID := c.Query("ledger_id")
	if ledgerID == "" {
		return nil, fmt.Errorf("ledger_id is required")
	}

	if err := h.KeyEventSvc.DeleteByDate(ws, ledgerID, date); err != nil {
		return nil, err
	}
	return nil, nil
}

// GET /api/v1/key-events/:date/images
func (h *Handlers) listKeyEventImages(c *gin.Context) (any, error) {
	ws := ws(c)

	date := c.Param("date")
	if date == "" {
		return nil, fmt.Errorf("missing date parameter")
	}

	return h.KeyEventImgSvc.GetImagesByEventDate(ws, date)
}

// POST /api/v1/key-events/:date/images  body: { data, filename }
func (h *Handlers) addKeyEventImage(c *gin.Context) (any, error) {
	ws := ws(c)

	date := c.Param("date")
	if date == "" {
		return nil, fmt.Errorf("missing date parameter")
	}

	arg, ok := JsonArg(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}

	data, ok := arg["data"].(string)
	if !ok || data == "" {
		return nil, fmt.Errorf("invalid image data")
	}

	filename, _ := arg["filename"].(string)

	image, err := h.KeyEventImgSvc.AddImage(ws, date, data, filename)
	if err != nil {
		return nil, err
	}
	return image.ID, nil
}

// DELETE /api/v1/key-event-images/:id
func (h *Handlers) deleteKeyEventImage(c *gin.Context) (any, error) {
	ws := ws(c)

	imageId := c.Param("id")
	if imageId == "" {
		return nil, fmt.Errorf("missing image id parameter")
	}

	if err := h.KeyEventImgSvc.DeleteImage(ws, imageId); err != nil {
		return nil, err
	}
	return nil, nil
}
