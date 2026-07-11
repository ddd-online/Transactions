package api

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models/dto"
)

// POST /transactions/query
func (h *Handlers) queryTransactions(c *gin.Context) (any, error) {
	ws := ws(c)

	queryCondition, ok := dto.JsonQueryCondition(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}
	return h.TrSvc.QueryTrsOnCondition(ws, queryCondition)
}

// POST /transactions
func (h *Handlers) createTransaction(c *gin.Context) (any, error) {
	ws := ws(c)

	trDto, ok := dto.JsonTransactionRecordDto(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}
	if err := trDto.Validate(); err != nil {
		return nil, err
	}

	return h.TrSvc.CreateTr(ws, trDto)
}

// POST /transactions/batch
func (h *Handlers) batchCreateTransactions(c *gin.Context) (any, error) {
	ws := ws(c)

	dtos, ok := dto.JsonTransactionRecordDtoBatch(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}
	for i, trDto := range dtos {
		if err := trDto.Validate(); err != nil {
			return nil, fmt.Errorf("record %d: %w", i+1, err)
		}
	}

	return h.TrSvc.BatchCreateTr(ws, dtos)
}

// DELETE /transactions/:id
func (h *Handlers) deleteTransaction(c *gin.Context) (any, error) {
	ws := ws(c)

	id := c.Param("id")
	if id == "" {
		return nil, fmt.Errorf("missing transaction id")
	}

	if err := h.TrSvc.DeleteTrById(ws, id); err != nil {
		return nil, err
	}
	return nil, nil
}

// POST /transactions/query-chart-data
func (h *Handlers) queryChartData(c *gin.Context) (any, error) {
	ws := ws(c)

	req, ok := dto.JsonChartQuery(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}
	return h.TrSvc.QueryTrsForChart(ws, req)
}

// POST /transactions/link
func (h *Handlers) linkTransactionToKeyEvent(c *gin.Context) (any, error) {
	ws := ws(c)

	arg, ok := JsonArg(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}

	trId, _ := arg["transaction_id"].(string)
	date, _ := arg["date"].(string)

	if trId == "" || date == "" {
		return nil, fmt.Errorf("transaction_id and date are required")
	}

	if err := h.TrSvc.LinkToKeyEvent(ws, trId, date); err != nil {
		return nil, err
	}
	return date, nil
}

// POST /transactions/unlink
func (h *Handlers) unlinkTransactionFromKeyEvent(c *gin.Context) (any, error) {
	ws := ws(c)

	arg, ok := JsonArg(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}

	trId, _ := arg["transaction_id"].(string)
	if trId == "" {
		return nil, fmt.Errorf("transaction_id is required")
	}

	if err := h.TrSvc.UnlinkFromKeyEvent(ws, trId); err != nil {
		return nil, err
	}
	return trId, nil
}

// GET /transactions/linked/:date
func (h *Handlers) listLinkedTransactions(c *gin.Context) (any, error) {
	ws := ws(c)

	date := c.Param("date")
	if date == "" {
		return nil, fmt.Errorf("date is required")
	}

	return h.TrSvc.QueryLinkedByDate(ws, date)
}
