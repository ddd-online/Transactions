package api

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"

	"github.com/billadm/constant"
	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/service"
)

// GET /ledgers?id=all or id=uuid1,uuid2
// POST /ledgers (body: {name: string})
func listLedgers(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	ledgerId := c.Query("id")
	if ledgerId == "" {
		ret.Code = -1
		ret.Msg = "missing required query parameter: id"
		return
	}

	var ledgers []models.Ledger
	var err error
	if ledgerId == constant.All {
		ledgers, err = service.GetLedgerService().ListAllLedger(ws)
		if err != nil {
			ret.Code = -1
			ret.Msg = err.Error()
			return
		}
	} else {
		var ledger *models.Ledger
		ledgerIds := strings.Split(ledgerId, ",")
		for _, id := range ledgerIds {
			id = strings.TrimSpace(id)
			ledger, err = service.GetLedgerService().QueryLedgerById(ws, id)
			if err != nil {
				ret.Code = -1
				ret.Msg = fmt.Sprintf("查询账本 %s 失败: %v", id, err)
				return
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

	ret.Data = ledgerDtos
}

// POST /ledgers
func createLedger(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	arg, ok := JsonArg(c, ret)
	if !ok {
		return
	}

	ledgerName, ok := arg["name"].(string)
	if !ok {
		ret.Code = -1
		ret.Msg = "name在请求体中不存在"
		return
	}

	description, _ := arg["description"].(string)

	ledgerId, err := service.GetLedgerService().CreateLedger(ws, ledgerName, description)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ret.Data = ledgerId
}

// GET /ledgers/:id
func getLedger(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	id := c.Param("id")
	if id == "" {
		ret.Code = -1
		ret.Msg = "missing ledger id"
		return
	}

	ledger, err := service.GetLedgerService().QueryLedgerById(ws, id)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	ledgerDto := dto.LedgerDto{}
	ledgerDto.FromLedger(ledger)
	ret.Data = ledgerDto
}

// PATCH /ledgers/:id
func updateLedger(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	id := c.Param("id")
	if id == "" {
		ret.Code = -1
		ret.Msg = "missing ledger id"
		return
	}

	arg, ok := JsonArg(c, ret)
	if !ok {
		return
	}

	ledgerName, ok := arg["name"].(string)
	if !ok {
		ret.Code = -1
		ret.Msg = "name在请求体中不存在"
		return
	}

	description, _ := arg["description"].(string)

	err := service.GetLedgerService().ModifyLedger(ws, id, ledgerName, description)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

// DELETE /ledgers/:id
func deleteLedger(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := ws(c)

	id := c.Param("id")
	if id == "" {
		ret.Code = -1
		ret.Msg = "missing ledger id"
		return
	}

	err := service.GetLedgerService().DeleteLedgerById(ws, id)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}
