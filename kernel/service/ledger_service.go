package service

import (
	"fmt"

	"github.com/billadm/models"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

func NewLedgerService() LedgerService {
	return &ledgerServiceImpl{}
}

type LedgerService interface {
	CreateLedger(ws *workspace.Workspace, ledgerName string, description string) (string, error)
	ModifyLedger(ws *workspace.Workspace, ledgerId, ledgerName, description string) error
	ListAllLedger(ws *workspace.Workspace) ([]models.Ledger, error)
	QueryLedgerById(ws *workspace.Workspace, ledgerId string) (*models.Ledger, error)
	QueryLedgerByName(ws *workspace.Workspace, ledgerName string) (*models.Ledger, error)
	DeleteLedgerById(ws *workspace.Workspace, ledgerId string) error
}

var _ LedgerService = &ledgerServiceImpl{}

type ledgerServiceImpl struct{}

func (l *ledgerServiceImpl) CreateLedger(ws *workspace.Workspace, ledgerName string, description string) (string, error) {
	ledger := &models.Ledger{
		ID:          util.GetUUID(),
		Name:        ledgerName,
		Description: description,
	}

	if err := ws.GetDb().Create(ledger).Error; err != nil {
		logrus.Errorf("创建账本失败, name: %s, err: %v", ledgerName, err)
		return "", err
	}

	return ledger.ID, nil
}

func (l *ledgerServiceImpl) ModifyLedger(ws *workspace.Workspace, ledgerId, ledgerName, description string) error {

	ledger := &models.Ledger{
		ID:          ledgerId,
		Name:        ledgerName,
		Description: description,
	}

	if err := ws.GetDb().Model(ledger).
		Where("id = ?", ledger.ID).
		Updates(map[string]interface{}{
			"name":        ledger.Name,
			"description": ledger.Description,
		}).Error; err != nil {
		logrus.Errorf("修改账本失败, id: %s, err: %v", ledgerId, err)
		return err
	}

	return nil
}

func (l *ledgerServiceImpl) ListAllLedger(ws *workspace.Workspace) ([]models.Ledger, error) {

	ledgers := make([]models.Ledger, 0)
	if err := ws.GetDb().Find(&ledgers).Error; err != nil {
		logrus.Errorf("列出账本失败, err: %v", err)
		return nil, err
	}

	return ledgers, nil
}

func (l *ledgerServiceImpl) QueryLedgerById(ws *workspace.Workspace, ledgerId string) (*models.Ledger, error) {

	var ledger models.Ledger
	if err := ws.GetDb().Where("id = ?", ledgerId).First(&ledger).Error; err != nil {
		logrus.Errorf("按 ID 查询账本失败, id: %s, err: %v", ledgerId, err)
		return nil, err
	}

	return &ledger, nil
}

func (l *ledgerServiceImpl) QueryLedgerByName(ws *workspace.Workspace, ledgerName string) (*models.Ledger, error) {

	var ledger models.Ledger
	if err := ws.GetDb().Where("name = ?", ledgerName).First(&ledger).Error; err != nil {
		logrus.Errorf("按名称查询账本失败, name: %s, err: %v", ledgerName, err)
		return nil, err
	}

	return &ledger, nil
}

func (l *ledgerServiceImpl) DeleteLedgerById(ws *workspace.Workspace, ledgerId string) error {

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		if err := deleteTrTagByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete tr tags: %w", err)
		}

		cnt, err := countTrByLedgerId(tx, ledgerId)
		if err != nil {
			return fmt.Errorf("count trs: %w", err)
		}
		logrus.Infof("将删除账本 %s 下的 %d 条交易记录", ledgerId, cnt)

		if err := deleteAllTrByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete trs: %w", err)
		}

		if err := tx.GetDb().Where("id = ?", ledgerId).Delete(&models.Ledger{}).Error; err != nil {
			return fmt.Errorf("delete ledger: %w", err)
		}
		return nil
	})

	if err != nil {
		logrus.Errorf("删除账本失败, id: %s, err: %v", ledgerId, err)
		return err
	}

	return nil
}
