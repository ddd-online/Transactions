package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

type TransactionTemplateDao interface {
	Create(ws *workspace.Workspace, template *models.TransactionTemplate) error
	DeleteById(ws *workspace.Workspace, templateId string) error
	GetMaxSort(ws *workspace.Workspace, ledgerID string) (int, error)
	QueryByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*models.TransactionTemplate, error)
	UpdateSort(ws *workspace.Workspace, templateId string, sortOrder int) error
}

var _ TransactionTemplateDao = &trTemplateDaoImpl{}

type trTemplateDaoImpl struct{}

func NewTransactionTemplateDao() TransactionTemplateDao {
	return &trTemplateDaoImpl{}
}

func (d *trTemplateDaoImpl) Create(ws *workspace.Workspace, template *models.TransactionTemplate) error {
	return ws.GetDb().Create(template).Error
}

func (d *trTemplateDaoImpl) DeleteById(ws *workspace.Workspace, templateId string) error {
	return ws.GetDb().Where("template_id = ?", templateId).Delete(&models.TransactionTemplate{}).Error
}

func (d *trTemplateDaoImpl) GetMaxSort(ws *workspace.Workspace, ledgerID string) (int, error) {
	var maxSortOrder int
	if err := ws.GetDb().Model(&models.TransactionTemplate{}).
		Where("ledger_id = ?", ledgerID).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error; err != nil {
		return 0, err
	}
	return maxSortOrder, nil
}

func (d *trTemplateDaoImpl) QueryByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*models.TransactionTemplate, error) {
	templates := make([]*models.TransactionTemplate, 0)
	if err := ws.GetDb().
		Where("ledger_id = ?", ledgerId).
		Order("sort_order ASC, created_at DESC").
		Find(&templates).Error; err != nil {
		return nil, err
	}
	return templates, nil
}

func (d *trTemplateDaoImpl) UpdateSort(ws *workspace.Workspace, templateId string, sortOrder int) error {
	return ws.GetDb().
		Model(&models.TransactionTemplate{}).
		Where("template_id = ?", templateId).
		Update("sort_order", sortOrder).Error
}
