package service

import (
	"fmt"

	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

var ledgerSvc LedgerService

func SetLedgerService(svc LedgerService) { ledgerSvc = svc }
func GetLedgerService() LedgerService      { return ledgerSvc }

func NewLedgerService(trDao dao.TransactionRecordDao, trTagDao dao.TrTagDao) LedgerService {
	return &ledgerServiceImpl{
		trDao:    trDao,
		trTagDao: trTagDao,
	}
}

type LedgerService interface {
	CreateLedger(ws *workspace.Workspace, ledgerName string, description string) (string, error)
	ModifyLedger(ws *workspace.Workspace, ledgerId, ledgerName, description string) error
	ListAllLedger(ws *workspace.Workspace) ([]models.Ledger, error)
	QueryLedgerById(ws *workspace.Workspace, ledgerId string) (*models.Ledger, error)
	DeleteLedgerById(ws *workspace.Workspace, ledgerId string) error
}

var _ LedgerService = &ledgerServiceImpl{}

type ledgerServiceImpl struct {
	trDao    dao.TransactionRecordDao
	trTagDao dao.TrTagDao
}

// CreateLedger 创建成功返回创建账本id
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

// ModifyLedger 修改指定账本的名称和描述
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

// ListAllLedger 查询所有账本
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

// QueryLedgerById 查询单个账本
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

// DeleteLedgerById deletes a ledger and all its associated transaction records and tags in a transaction.
func (l *ledgerServiceImpl) DeleteLedgerById(ws *workspace.Workspace, ledgerId string) error {
	logrus.Infof("start to delete ledger by id, id: %s", ledgerId)

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		// Delete all tags for this ledger's transactions
		if err := l.trTagDao.DeleteTrTagByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete tr tags: %w", err)
		}

		// Count and delete all transaction records
		cnt, err := l.trDao.CountTrByLedgerId(tx, ledgerId)
		if err != nil {
			return fmt.Errorf("count trs: %w", err)
		}
		logrus.Infof("will delete trs by ledger id: %s, count: %d", ledgerId, cnt)

		if err := l.trDao.DeleteAllTrByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete trs: %w", err)
		}

		// Delete the ledger
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
