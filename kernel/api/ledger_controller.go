package api

import (
	"fmt"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/billadm/constant"
	"github.com/billadm/models"
	"github.com/billadm/models/dto"
)

// GET /ledgers?id=all or id=uuid1,uuid2
func (h *Handlers) listLedgers(c *gin.Context) (any, error) {
	ws := ws(c)

	ledgerId := c.Query("id")
	if ledgerId == "" {
		return nil, models.NewBadRequest("missing required query parameter: id")
	}

	var ledgers []models.Ledger
	var err error
	if ledgerId == constant.All {
		ledgers, err = h.LedgerSvc.ListAllLedger(ws)
		if err != nil {
			return nil, err
		}
	} else {
		var ledger *models.Ledger
		ledgerIds := strings.Split(ledgerId, ",")
		for _, id := range ledgerIds {
			id = strings.TrimSpace(id)
			ledger, err = h.LedgerSvc.QueryLedgerById(ws, id)
			if err != nil {
				return nil, fmt.Errorf("查询账本 %s 失败: %v", id, err)
			}
			ledgers = append(ledgers, *ledger)
		}
	}

	ledgerDtos := make([]dto.LedgerDto, 0)
	for _, ledger := range ledgers {
		ledgerDto := dto.LedgerDto{}
		ledgerDto.FromLedger(&ledger)
		ledgerDtos = append(ledgerDtos, ledgerDto)
	}

	return ledgerDtos, nil
}

// POST /ledgers
func (h *Handlers) createLedger(c *gin.Context) (any, error) {
	ws := ws(c)

	arg, ok := JsonArg(c)
	if !ok {
		return nil, models.NewBadRequest("parses request failed")
	}

	ledgerName, ok := arg["name"].(string)
	if !ok {
		return nil, models.NewBadRequest("name在请求体中不存在")
	}

	description, _ := arg["description"].(string)

	return h.LedgerSvc.CreateLedger(ws, ledgerName, description)
}

// GET /ledgers/:id
func (h *Handlers) getLedger(c *gin.Context) (any, error) {
	ws := ws(c)

	id := c.Param("id")
	if id == "" {
		return nil, models.NewBadRequest("missing ledger id")
	}

	ledger, err := h.LedgerSvc.QueryLedgerById(ws, id)
	if err != nil {
		return nil, models.NewNotFound(err.Error())
	}

	ledgerDto := dto.LedgerDto{}
	ledgerDto.FromLedger(ledger)
	return ledgerDto, nil
}

// PATCH /ledgers/:id
func (h *Handlers) updateLedger(c *gin.Context) (any, error) {
	ws := ws(c)

	id := c.Param("id")
	if id == "" {
		return nil, models.NewBadRequest("missing ledger id")
	}

	arg, ok := JsonArg(c)
	if !ok {
		return nil, models.NewBadRequest("parses request failed")
	}

	ledgerName, ok := arg["name"].(string)
	if !ok {
		return nil, models.NewBadRequest("name在请求体中不存在")
	}

	description, _ := arg["description"].(string)

	if err := h.LedgerSvc.ModifyLedger(ws, id, ledgerName, description); err != nil {
		return nil, err
	}
	return nil, nil
}

// DELETE /ledgers/:id
func (h *Handlers) deleteLedger(c *gin.Context) (any, error) {
	ws := ws(c)

	id := c.Param("id")
	if id == "" {
		return nil, models.NewBadRequest("missing ledger id")
	}

	if err := h.LedgerSvc.DeleteLedgerById(ws, id); err != nil {
		return nil, err
	}
	return nil, nil
}
