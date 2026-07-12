package service

import (
	"github.com/billadm/dao"
	"github.com/billadm/models/dto"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

func NewTrTemplateService(trTemplateDao dao.TransactionTemplateDao) TransactionTemplateService {
	return &transactionTemplateServiceImpl{
		trTemplateDao: trTemplateDao,
	}
}

type TransactionTemplateService interface {
	Create(ws *workspace.Workspace, dto *dto.TransactionTemplateDto) (string, error)
	DeleteById(ws *workspace.Workspace, templateId string) error
	ListByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*dto.TransactionTemplateDto, error)
	UpdateSortOrder(ws *workspace.Workspace, templateId string, ledgerId string, sortOrder int) error
}

var _ TransactionTemplateService = &transactionTemplateServiceImpl{}

type transactionTemplateServiceImpl struct {
	trTemplateDao dao.TransactionTemplateDao
}

func (t *transactionTemplateServiceImpl) Create(ws *workspace.Workspace, dto *dto.TransactionTemplateDto) (string, error) {
	templateID := util.GetUUID()

	maxSortOrder, err := t.trTemplateDao.GetMaxSort(ws, dto.LedgerID)
	if err != nil {
		logrus.Errorf("获取最大排序号失败: %v", err)
		return "", err
	}

	record := dto.ToTransactionTemplate()
	record.TemplateID = templateID
	record.SortOrder = maxSortOrder + 1

	if err := t.trTemplateDao.Create(ws, record); err != nil {
		logrus.Errorf("创建交易模板失败: %v", err)
		return "", err
	}

	return templateID, nil
}

func (t *transactionTemplateServiceImpl) DeleteById(ws *workspace.Workspace, templateId string) error {
	if err := t.trTemplateDao.DeleteById(ws, templateId); err != nil {
		logrus.Errorf("删除交易模板失败: %v", err)
		return err
	}

	return nil
}

func (t *transactionTemplateServiceImpl) ListByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*dto.TransactionTemplateDto, error) {
	templates, err := t.trTemplateDao.QueryByLedgerId(ws, ledgerId)
	if err != nil {
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
	if err := t.trTemplateDao.UpdateSort(ws, templateId, sortOrder); err != nil {
		logrus.Errorf("更新模板排序失败: %v", err)
		return err
	}

	return nil
}
