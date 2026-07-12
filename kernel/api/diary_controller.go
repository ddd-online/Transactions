package api

import (
	"fmt"

	"github.com/gin-gonic/gin"
)

// GET /api/v1/diary/dates
func (h *Handlers) listDiaryDates(c *gin.Context) (any, error) {
	ws := ws(c)
	return h.DiarySvc.ListDates(ws)
}

func requireDate(c *gin.Context) (string, error) {
	date := c.Param("date")
	if date == "" {
		return "", fmt.Errorf("missing date parameter")
	}
	return date, nil
}

// GET /api/v1/diary/:date
func (h *Handlers) getDiary(c *gin.Context) (any, error) {
	ws := ws(c)
	date, err := requireDate(c)
	if err != nil {
		return nil, err
	}
	return h.DiarySvc.GetByDate(ws, date)
}

// PUT /api/v1/diary/:date  body: { content, mood }
func (h *Handlers) upsertDiary(c *gin.Context) (any, error) {
	ws := ws(c)
	date, err := requireDate(c)
	if err != nil {
		return nil, err
	}

	arg, ok := JsonArg(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}

	content, _ := arg["content"].(string)
	mood, _ := arg["mood"].(string)

	return h.DiarySvc.Upsert(ws, date, content, mood)
}

// DELETE /api/v1/diary/:date
func (h *Handlers) deleteDiary(c *gin.Context) (any, error) {
	ws := ws(c)
	date, err := requireDate(c)
	if err != nil {
		return nil, err
	}

	if err := h.DiarySvc.DeleteByDate(ws, date); err != nil {
		return nil, err
	}
	return nil, nil
}

// POST /api/v1/diary/import/scan  body: { directory }
func (h *Handlers) importScanDiary(c *gin.Context) (any, error) {
	arg, ok := JsonArg(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}

	directory, _ := arg["directory"].(string)
	if directory == "" {
		return nil, fmt.Errorf("directory is required")
	}

	files, err := h.DiarySvc.ScanDirectory(directory)
	if err != nil {
		return nil, err
	}
	return map[string]any{"files": files}, nil
}

// POST /api/v1/diary/import/file  body: { path, date }
func (h *Handlers) importOneDiary(c *gin.Context) (any, error) {
	ws := ws(c)

	arg, ok := JsonArg(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}

	path, _ := arg["path"].(string)
	date, _ := arg["date"].(string)
	if path == "" || date == "" {
		return nil, fmt.Errorf("path and date are required")
	}

	return h.DiarySvc.ImportFile(ws, path, date)
}
