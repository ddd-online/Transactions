package api

import (
	"github.com/gin-gonic/gin"

	"github.com/billadm/api/binding"
	"github.com/billadm/models"
)

// POST /charts
func (h *Handlers) createChart(c *gin.Context) (any, error) {
	ws := ws(c)

	req, ok := binding.JsonCreateChart(c)
	if !ok {
		return nil, models.NewBadRequest("parse create chart request failed")
	}

	return h.ChartSvc.Create(ws, req)
}

// DELETE /charts/:id
func (h *Handlers) deleteChart(c *gin.Context) (any, error) {
	ws := ws(c)

	chartId := c.Param("id")
	if chartId == "" {
		return nil, models.NewBadRequest("missing chart id")
	}

	if err := h.ChartSvc.DeleteById(ws, chartId); err != nil {
		return nil, err
	}
	return nil, nil
}

// GET /charts?ledgerId=xxx
func (h *Handlers) listCharts(c *gin.Context) (any, error) {
	ws := ws(c)

	ledgerId := c.Query("ledgerId")
	if ledgerId == "" {
		return nil, models.NewBadRequest("missing ledgerId")
	}

	return h.ChartSvc.ListByLedgerId(ws, ledgerId)
}

// PATCH /charts
func (h *Handlers) updateChart(c *gin.Context) (any, error) {
	ws := ws(c)

	req, ok := binding.JsonUpdateChart(c)
	if !ok {
		return nil, models.NewBadRequest("parse update chart request failed")
	}

	return h.ChartSvc.Update(ws, req)
}
