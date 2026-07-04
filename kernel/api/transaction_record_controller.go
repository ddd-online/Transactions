package api

import (
	"fmt"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/sirupsen/logrus"

	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/service"
)

// POST /transactions/query
func queryTransactions(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	queryCondition, ok := dto.JsonQueryCondition(c, ret)
	if !ok {
		return
	}
	logrus.Debugf("query condition: %v", queryCondition)

	result, err := service.GetTrService().QueryTrsOnCondition(ws, queryCondition)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = result
}

// POST /transactions
func createTransaction(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	trDto, ok := dto.JsonTransactionRecordDto(c, ret)
	if !ok {
		return
	}
	logrus.Debugf("tr dto: %v", trDto)

	if !trDto.Validate(ret) {
		logrus.Errorf("validate transaction record error, err: %v", ret.Msg)
		return
	}

	trId, err := service.GetTrService().CreateTr(ws, trDto)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = trId
}

// POST /transactions/batch
func batchCreateTransactions(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	dtos, ok := dto.JsonTransactionRecordDtoBatch(c, ret)
	if !ok {
		return
	}
	logrus.Debugf("batch create %d transaction records", len(dtos))

	// Validate all records first
	for i, trDto := range dtos {
		if !trDto.Validate(ret) {
			ret.Code = -1
			ret.Msg = fmt.Sprintf("record %d: %s", i+1, ret.Msg)
			logrus.Errorf("validate transaction record %d error: %v", i+1, ret.Msg)
			return
		}
	}

	count, err := service.GetTrService().BatchCreateTr(ws, dtos)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = count
}

// DELETE /transactions/:id
func deleteTransaction(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	id := c.Param("id")
	if id == "" {
		ret.Code = -1
		ret.Msg = "missing transaction id"
		return
	}

	err := service.GetTrService().DeleteTrById(ws, id)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

// POST /transactions/query-chart-data
func queryChartData(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	req, ok := dto.JsonChartQuery(c, ret)
	if !ok {
		return
	}
	logrus.Debugf("chart query request: %v", req)

	result, err := service.GetTrService().QueryTrsForChart(ws, req)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = result
}

// POST /transactions/link
func linkTransactionToKeyEvent(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	arg, ok := JsonArg(c, ret)
	if !ok {
		return
	}

	trId, _ := arg["transaction_id"].(string)
	date, _ := arg["date"].(string)

	if trId == "" || date == "" {
		ret.Code = -1
		ret.Msg = "transaction_id and date are required"
		return
	}

	if err := service.GetTrService().LinkToKeyEvent(ws, trId, date); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = date
}

// POST /transactions/unlink
func unlinkTransactionFromKeyEvent(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	arg, ok := JsonArg(c, ret)
	if !ok {
		return
	}

	trId, _ := arg["transaction_id"].(string)
	if trId == "" {
		ret.Code = -1
		ret.Msg = "transaction_id is required"
		return
	}

	if err := service.GetTrService().UnlinkFromKeyEvent(ws, trId); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = trId
}

// GET /transactions/linked/:date
func listLinkedTransactions(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	date := c.Param("date")
	if date == "" {
		ret.Code = -1
		ret.Msg = "date is required"
		return
	}

	dtos, err := service.GetTrService().QueryLinkedByDate(ws, date)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = dtos
}
