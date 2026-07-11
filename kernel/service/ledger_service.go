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
	DeleteLedgerById(ws *workspace.Workspace, ledgerId string) error
}

var _ LedgerService = &ledgerServiceImpl{}

type ledgerServiceImpl struct{}

func (l *ledgerServiceImpl) CreateLedger(ws *workspace.Workspace, ledgerName string, description string) (string, error) {
	logrus.Infof("start to create ledger, name: %s", ledgerName)
	ledger := &models.Ledger{
		ID:          util.GetUUID(),
		Name:        ledgerName,
		Description: description,
	}

	if err := ws.GetDb().Create(ledger).Error; err != nil {
		logrus.Errorf("create ledger failed, name: %s, err: %v", ledgerName, err)
		return "", err
	}

	logrus.Infof("create ledger success, name: %s", ledgerName)
	return ledger.ID, nil
}

func (l *ledgerServiceImpl) ModifyLedger(ws *workspace.Workspace, ledgerId, ledgerName, description string) error {
	logrus.Infof("start to modify ledger, id: %s, new name: %s, description: %s", ledgerId, ledgerName, description)

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
		logrus.Errorf("modify ledger failed, id: %s, err: %v", ledgerId, err)
		return err
	}

	logrus.Infof("modify ledger success")
	return nil
}

func (l *ledgerServiceImpl) ListAllLedger(ws *workspace.Workspace) ([]models.Ledger, error) {
	logrus.Infof("start to list all ledgers")

	ledgers := make([]models.Ledger, 0)
	if err := ws.GetDb().Find(&ledgers).Error; err != nil {
		logrus.Errorf("list all ledgers failed, err: %v", err)
		return nil, err
	}

	logrus.Infof("end to list all ledgers, len: %d", len(ledgers))
	return ledgers, nil
}

func (l *ledgerServiceImpl) QueryLedgerById(ws *workspace.Workspace, ledgerId string) (*models.Ledger, error) {
	logrus.Infof("start to query ledger by id, id: %s", ledgerId)

	var ledger models.Ledger
	if err := ws.GetDb().Where("id = ?", ledgerId).First(&ledger).Error; err != nil {
		logrus.Errorf("query ledger by id failed, id: %s, err: %v", ledgerId, err)
		return nil, err
	}

	logrus.Infof("end to query ledger by id, id: %s", ledgerId)
	return &ledger, nil
}

func (l *ledgerServiceImpl) DeleteLedgerById(ws *workspace.Workspace, ledgerId string) error {
	logrus.Infof("start to delete ledger by id, id: %s", ledgerId)

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		if err := deleteTrTagByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete tr tags: %w", err)
		}

		cnt, err := countTrByLedgerId(tx, ledgerId)
		if err != nil {
			return fmt.Errorf("count trs: %w", err)
		}
		logrus.Infof("will delete trs by ledger id: %s, count: %d", ledgerId, cnt)

		if err := deleteAllTrByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete trs: %w", err)
		}

		if err := tx.GetDb().Where("id = ?", ledgerId).Delete(&models.Ledger{}).Error; err != nil {
			return fmt.Errorf("delete ledger: %w", err)
		}
		return nil
	})

	if err != nil {
		logrus.Errorf("delete ledger by id failed, id: %s, err: %v", ledgerId, err)
		return err
	}

	logrus.Infof("end to delete ledger by id, id: %s", ledgerId)
	return nil
}
