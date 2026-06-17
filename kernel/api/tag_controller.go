package api

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/service"
	"github.com/billadm/workspace"
)

// GET /tags?categoryTransactionType=xxx&ledgerId=xxx
func listTags(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	categoryTransactionType := c.Query("categoryTransactionType")
	ledgerId := c.Query("ledgerId")
	if ledgerId == "" {
		ret.Code = -1
		ret.Msg = "缺少 ledgerId 参数"
		return
	}

	tags, err := service.GetTagService().QueryTags(ws, ledgerId, categoryTransactionType)
	if err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}

	tagDtos := make([]dto.TagDto, 0)
	for _, tag := range tags {
		tagDto := dto.TagDto{}
		tagDto.FromTag(&tag)
		// Count records for this tag
		count, err := service.GetTagService().CountRecordsByTag(ws, ledgerId, tag.Name)
		if err == nil {
			tagDto.RecordCount = int(count)
		}
		tagDtos = append(tagDtos, tagDto)
	}

	ret.Data = tagDtos
}

// POST /tags
func createTag(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	var req dto.CreateTagRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		ret.Code = -1
		ret.Msg = "Invalid request: " + err.Error()
		return
	}

	if err := service.GetTagService().CreateTag(ws, req.LedgerID, req.Name, req.CategoryTransactionType); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

// DELETE /tags/:name
func deleteTag(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	name := c.Param("name")
	categoryTransactionType := c.Query("categoryTransactionType")
	ledgerID := c.Query("ledgerId")
	if name == "" || categoryTransactionType == "" || ledgerID == "" {
		ret.Code = -1
		ret.Msg = "Missing required parameters"
		return
	}

	if err := service.GetTagService().DeleteTag(ws, ledgerID, name, categoryTransactionType); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}

// PATCH /tags/:name/sort
func updateTagSort(c *gin.Context) {
	ret := models.NewResult()
	defer c.JSON(http.StatusOK, ret)

	ws := workspace.Manager.OpenedWorkspace()
	if ws == nil {
		ret.Code = -1
		ret.Msg = workspace.ErrOpenedWorkspaceNotFound
		return
	}

	name := c.Param("name")
	var req dto.UpdateTagSortRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		ret.Code = -1
		ret.Msg = "Invalid request: " + err.Error()
		return
	}

	if err := service.GetTagService().UpdateTagSort(ws, req.LedgerID, name, req.CategoryTransactionType, req.SortOrder); err != nil {
		ret.Code = -1
		ret.Msg = err.Error()
		return
	}
}