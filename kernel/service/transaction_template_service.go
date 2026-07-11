package service

import (
	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

func NewTrTemplateService() TransactionTemplateService {
	return &transactionTemplateServiceImpl{}
}

type TransactionTemplateService interface {
	Create(ws *workspace.Workspace, dto *dto.TransactionTemplateDto) (string, error)
	DeleteById(ws *workspace.Workspace, templateId string) error
	ListByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*dto.TransactionTemplateDto, error)
	UpdateSortOrder(ws *workspace.Workspace, templateId string, ledgerId string, sortOrder int) error
}

var _ TransactionTemplateService = &transactionTemplateServiceImpl{}

type transactionTemplateServiceImpl struct{}

func (t *transactionTemplateServiceImpl) Create(ws *workspace.Workspace, dto *dto.TransactionTemplateDto) (string, error) {

	templateID := util.GetUUID()

	// Get max sort order for this ledger
	var maxSortOrder int
	if err := ws.GetDb().Model(&models.TransactionTemplate{}).
		Where("ledger_id = ?", dto.LedgerID).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error; err != nil {
		logrus.Errorf("获取最大排序号失败: %v", err)
		return "", err
	}

	record := dto.ToTransactionTemplate()
	record.TemplateID = templateID
	record.SortOrder = maxSortOrder + 1

	if err := ws.GetDb().Create(record).Error; err != nil {
		logrus.Errorf("创建交易模板失败: %v", err)
		return "", err
	}

	return templateID, nil
}

func (t *transactionTemplateServiceImpl) DeleteById(ws *workspace.Workspace, templateId string) error {

	if err := ws.GetDb().
		Where("template_id = ?", templateId).
		Delete(&models.TransactionTemplate{}).Error; err != nil {
		logrus.Errorf("删除交易模板失败: %v", err)
		return err
	}

	return nil
}

func (t *transactionTemplateServiceImpl) ListByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*dto.TransactionTemplateDto, error) {

	templates := make([]*models.TransactionTemplate, 0)
	if err := ws.GetDb().
		Where("ledger_id = ?", ledgerId).
		Order("sort_order ASC, created_at DESC").
		Find(&templates).Error; err != nil {
		return nil, err
	}

	dtos := make([]*dto.TransactionTemplateDto, 0, len(templates))
	for _, template := range templates {
		dto := &dto.TransactionTemplateDto{}
		dto.FromTransactionTemplate(template)
		dtos = append(dtos, dto)
	}

	return dtos, nil
}

func (t *transactionTemplateServiceImpl) UpdateSortOrder(ws *workspace.Workspace, templateId string, ledgerId string, sortOrder int) error {

	if err := ws.GetDb().
		Model(&models.TransactionTemplate{}).
		Where("template_id = ?", templateId).
		Update("sort_order", sortOrder).Error; err != nil {
		logrus.Errorf("更新模板排序失败: %v", err)
		return err
	}

	return nil
}
