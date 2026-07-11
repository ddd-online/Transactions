package api

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models/dto"
)

// POST /templates
func (h *Handlers) createTemplate(c *gin.Context) (any, error) {
	ws := ws(c)

	templateDto, ok := dto.JsonTransactionTemplateDto(c)
	if !ok {
		return nil, fmt.Errorf("parses request failed")
	}
	if err := templateDto.Validate(); err != nil {
		return nil, err
	}

	return h.TrTemplateSvc.Create(ws, templateDto)
}

// GET /templates
func (h *Handlers) listTemplates(c *gin.Context) (any, error) {
	ws := ws(c)

	ledgerId := c.Query("ledgerId")
	if ledgerId == "" {
		return nil, fmt.Errorf("missing ledgerId")
	}

	return h.TrTemplateSvc.ListByLedgerId(ws, ledgerId)
}

// DELETE /templates/:id
func (h *Handlers) deleteTemplate(c *gin.Context) (any, error) {
	ws := ws(c)

	id := c.Param("id")
	if id == "" {
		return nil, fmt.Errorf("missing template id")
	}

	if err := h.TrTemplateSvc.DeleteById(ws, id); err != nil {
		return nil, err
	}
	return nil, nil
}

// PATCH /templates/:id/sort
func (h *Handlers) updateTemplateSort(c *gin.Context) (any, error) {
	ws := ws(c)

	id := c.Param("id")
	var req struct {
		LedgerID  string `json:"ledgerId"`
		SortOrder int    `json:"sortOrder"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	if err := h.TrTemplateSvc.UpdateSortOrder(ws, id, req.LedgerID, req.SortOrder); err != nil {
		return nil, err
	}
	return nil, nil
}
