package api

import (
	"github.com/gin-gonic/gin"

	"github.com/transactions/models"
	"github.com/transactions/models/dto"
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

	names := make([]string, 0, len(tags))
	for i := range tags {
		names = append(names, tags[i].Name)
	}
	counts, err := h.TagSvc.CountRecordsByTags(ws, ledgerId, names)
	if err != nil {
		return nil, err
	}

	tagDtos := make([]dto.TagDto, 0, len(tags))
	for _, tag := range tags {
		tagDto := dto.TagDto{}
		tagDto.FromTag(&tag)
		tagDto.RecordCount = int(counts[tag.Name])
		tagDtos = append(tagDtos, tagDto)
	}

	return tagDtos, nil
}

// POST /tags
func (h *Handlers) createTag(c *gin.Context) (any, error) {
	ws := ws(c)

	var req dto.CreateTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		return nil, models.NewBadRequest("invalid request: " + err.Error())
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
		return nil, models.NewBadRequest("missing required parameters")
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
		return nil, models.NewBadRequest("invalid request: " + err.Error())
	}

	if err := h.TagSvc.UpdateTagSort(ws, req.LedgerID, name, req.CategoryTransactionType, req.SortOrder); err != nil {
		return nil, err
	}
	return nil, nil
}
