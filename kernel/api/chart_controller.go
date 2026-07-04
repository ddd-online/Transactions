package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/service"
)

// POST /charts
func createChart(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	req, ok := dto.JsonCreateChart(c, ret)
	if !ok {
		return
	}

	chart, err := service.GetChartService().Create(ws, req)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = chart
}

// DELETE /charts/:id
func deleteChart(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	chartId := c.Param("id")
	if chartId == "" {
		ret.Code = -1
		ret.Msg = "missing chart id"
		return
	}

	if err := service.GetChartService().DeleteById(ws, chartId); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

// GET /charts?ledgerId=xxx
func listCharts(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	ledgerId := c.Query("ledgerId")
	if ledgerId == "" {
		ret.Code = -1
		ret.Msg = "missing ledgerId"
		return
	}

	charts, err := service.GetChartService().ListByLedgerId(ws, ledgerId)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = charts
}

// PATCH /charts
func updateChart(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	req, ok := dto.JsonUpdateChart(c, ret)
	if !ok {
		return
	}

	chart, err := service.GetChartService().Update(ws, req)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = chart
}
