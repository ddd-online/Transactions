package api

import (
	"github.com/gin-gonic/gin"

	"github.com/transactions/models"
	"github.com/transactions/models/dto"
)

// GET /categories?type=all|income|expense|transfer&ledgerId=xxx
func (h *Handlers) listCategories(c *gin.Context) (any, error) {
	ws := ws(c)

	trType := c.Query("type")
	ledgerId := c.Query("ledgerId")
	if ledgerId == "" {
		return make([]dto.CategoryDto, 0), nil
	}

	categories, err := h.CategorySvc.QueryCategory(ws, ledgerId, trType)
	if err != nil {
		return nil, err
	}

	names := make([]string, 0, len(categories))
	for i := range categories {
		names = append(names, categories[i].Name)
	}
	counts, err := h.CategorySvc.CountRecordsByCategories(ws, ledgerId, names)
	if err != nil {
		return nil, err
	}

	categoryDtos := make([]dto.CategoryDto, 0, len(categories))
	for _, category := range categories {
		categoryDto := dto.CategoryDto{}
		categoryDto.FromCategory(&category)
		categoryDto.RecordCount = int(counts[category.Name])
		categoryDtos = append(categoryDtos, categoryDto)
	}

	return categoryDtos, nil
}

// POST /categories
func (h *Handlers) createCategory(c *gin.Context) (any, error) {
	ws := ws(c)

	var req dto.CreateCategoryRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		return nil, models.NewBadRequest("invalid request: " + err.Error())
	}

	if err := h.CategorySvc.CreateCategory(ws, req.LedgerID, req.Name, req.TransactionType); err != nil {
		return nil, err
	}
	return nil, nil
}

// DELETE /categories/:name
func (h *Handlers) deleteCategory(c *gin.Context) (any, error) {
	ws := ws(c)

	name := c.Param("name")
	transactionType := c.Query("type")
	ledgerID := c.Query("ledgerId")
	if name == "" || transactionType == "" || ledgerID == "" {
		return nil, models.NewBadRequest("missing required parameters")
	}

	if err := h.CategorySvc.DeleteCategory(ws, ledgerID, name, transactionType); err != nil {
		return nil, err
	}
	return nil, nil
}

// PATCH /categories/:name/sort
func (h *Handlers) updateCategorySort(c *gin.Context) (any, error) {
	ws := ws(c)

	name := c.Param("name")
	var req dto.UpdateCategorySortRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		return nil, models.NewBadRequest("invalid request: " + err.Error())
	}

	if err := h.CategorySvc.UpdateCategorySort(ws, req.LedgerID, name, req.TransactionType, req.SortOrder); err != nil {
		return nil, err
	}
	return nil, nil
}

// POST /categories/initialize
func (h *Handlers) initializeCategories(c *gin.Context) (any, error) {
	ws := ws(c)

	var req struct {
		LedgerID string `json:"ledgerId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		return nil, models.NewBadRequest("invalid request: " + err.Error())
	}

	if req.LedgerID == "" {
		return nil, models.NewBadRequest("缺少 ledgerId 参数")
	}

	categoryCount, tagCount, err := h.CategorySvc.InitializeCategories(ws, req.LedgerID)
	if err != nil {
		return nil, err
	}

	return dto.InitializeCategoriesResponse{
		Categories: categoryCount,
		Tags:       tagCount,
	}, nil
}
