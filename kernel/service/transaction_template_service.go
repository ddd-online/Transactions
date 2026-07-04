package service

import (
	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

var tmplSvc TransactionTemplateService

func SetTrTemplateService(svc TransactionTemplateService) { tmplSvc = svc }
func GetTrTemplateService() TransactionTemplateService      { return tmplSvc }

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
	logrus.Infof("start to create transaction template, ledger id: %s, name: %s", dto.LedgerID, dto.TemplateName)

	templateID := util.GetUUID()

	// Get max sort order for this ledger
	var maxSortOrder int
	if err := ws.GetDb().Model(&models.TransactionTemplate{}).
		Where("ledger_id = ?", dto.LedgerID).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error; err != nil {
		logrus.Errorf("get max sort order failed: %v", err)
		return "", err
	}

	record := dto.ToTransactionTemplate()
	record.TemplateID = templateID
	record.SortOrder = maxSortOrder + 1

	if err := ws.GetDb().Create(record).Error; err != nil {
		logrus.Errorf("create transaction template failed: %v", err)
		return "", err
	}

	logrus.Infof("create transaction template success, ledger id: %s, name: %s", dto.LedgerID, dto.TemplateName)
	return templateID, nil
}

func (t *transactionTemplateServiceImpl) DeleteById(ws *workspace.Workspace, templateId string) error {
	logrus.Infof("start to delete transaction template, id: %s", templateId)

	if err := ws.GetDb().
		Where("template_id = ?", templateId).
		Delete(&models.TransactionTemplate{}).Error; err != nil {
		logrus.Errorf("delete transaction template failed: %v", err)
		return err
	}

	logrus.Infof("delete transaction template success, id: %s", templateId)
	return nil
}

func (t *transactionTemplateServiceImpl) ListByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*dto.TransactionTemplateDto, error) {
	logrus.Infof("start to list transaction templates, ledger id: %s", ledgerId)

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

	logrus.Infof("list transaction templates success, ledger id: %s, count: %d", ledgerId, len(dtos))
	return dtos, nil
}

func (t *transactionTemplateServiceImpl) UpdateSortOrder(ws *workspace.Workspace, templateId string, ledgerId string, sortOrder int) error {
	logrus.Infof("start to update template sort, templateId: %s, sortOrder: %d", templateId, sortOrder)

	if err := ws.GetDb().
		Model(&models.TransactionTemplate{}).
		Where("template_id = ?", templateId).
		Update("sort_order", sortOrder).Error; err != nil {
		logrus.Errorf("update template sort failed: %v", err)
		return err
	}

	logrus.Infof("update template sort success, templateId: %s", templateId)
	return nil
}
