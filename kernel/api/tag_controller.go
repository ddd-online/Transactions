package api

import (
	"fmt"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models/dto"
)

// GET /tags?categoryTransactionType=xxx&ledgerId=xxx
func (h *Handlers) listTags(c *gin.Context) (any, error) {
	ws := ws(c)

	categoryTransactionType := c.Query("categoryTransactionType")
	ledgerId := c.Query("ledgerId")
	if ledgerId == "" {
		return make([]dto.TagDto, 0), nil
	}

	tags, err := h.TagSvc.QueryTags(ws, ledgerId, categoryTransactionType)
	if err != nil {
		return nil, err
	}

	tagDtos := make([]dto.TagDto, 0)
	for _, tag := range tags {
		tagDto := dto.TagDto{}
		tagDto.FromTag(&tag)
		count, err := h.TagSvc.CountRecordsByTag(ws, ledgerId, tag.Name)
		if err == nil {
			tagDto.RecordCount = int(count)
		}
		tagDtos = append(tagDtos, tagDto)
	}

	return tagDtos, nil
}

// POST /tags
func (h *Handlers) createTag(c *gin.Context) (any, error) {
	ws := ws(c)

	var req dto.CreateTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	if err := h.TagSvc.CreateTag(ws, req.LedgerID, req.Name, req.CategoryTransactionType); err != nil {
		return nil, err
	}
	return nil, nil
}

// DELETE /tags/:name
func (h *Handlers) deleteTag(c *gin.Context) (any, error) {
	ws := ws(c)

	name := c.Param("name")
	categoryTransactionType := c.Query("categoryTransactionType")
	ledgerID := c.Query("ledgerId")
	if name == "" || categoryTransactionType == "" || ledgerID == "" {
		return nil, fmt.Errorf("missing required parameters")
	}

	if err := h.TagSvc.DeleteTag(ws, ledgerID, name, categoryTransactionType); err != nil {
		return nil, err
	}
	return nil, nil
}

// PATCH /tags/:name/sort
func (h *Handlers) updateTagSort(c *gin.Context) (any, error) {
	ws := ws(c)

	name := c.Param("name")
	var req dto.UpdateTagSortRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		return nil, fmt.Errorf("invalid request: %w", err)
	}

	if err := h.TagSvc.UpdateTagSort(ws, req.LedgerID, name, req.CategoryTransactionType, req.SortOrder); err != nil {
		return nil, err
	}
	return nil, nil
}
