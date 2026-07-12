package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

type LedgerDao interface {
	Create(ws *workspace.Workspace, ledger *models.Ledger) error
	Update(ws *workspace.Workspace, ledger *models.Ledger) error
	ListAll(ws *workspace.Workspace) ([]models.Ledger, error)
	QueryById(ws *workspace.Workspace, ledgerId string) (*models.Ledger, error)
	QueryByName(ws *workspace.Workspace, ledgerName string) (*models.Ledger, error)
	DeleteById(ws *workspace.Workspace, ledgerId string) error
}

var _ LedgerDao = &ledgerDaoImpl{}

type ledgerDaoImpl struct{}

func NewLedgerDao() LedgerDao {
	return &ledgerDaoImpl{}
}

func (d *ledgerDaoImpl) Create(ws *workspace.Workspace, ledger *models.Ledger) error {
	return ws.GetDb().Create(ledger).Error
}

func (d *ledgerDaoImpl) Update(ws *workspace.Workspace, ledger *models.Ledger) error {
	return ws.GetDb().Model(ledger).
		Where("id = ?", ledger.ID).
		Updates(map[string]interface{}{
			"name":        ledger.Name,
			"description": ledger.Description,
		}).Error
}

func (d *ledgerDaoImpl) ListAll(ws *workspace.Workspace) ([]models.Ledger, error) {
	ledgers := make([]models.Ledger, 0)
	if err := ws.GetDb().Find(&ledgers).Error; err != nil {
		return nil, err
	}
	return ledgers, nil
}

func (d *ledgerDaoImpl) QueryById(ws *workspace.Workspace, ledgerId string) (*models.Ledger, error) {
	var ledger models.Ledger
	if err := ws.GetDb().Where("id = ?", ledgerId).First(&ledger).Error; err != nil {
		return nil, err
	}
	return &ledger, nil
}

func (d *ledgerDaoImpl) QueryByName(ws *workspace.Workspace, ledgerName string) (*models.Ledger, error) {
	var ledger models.Ledger
	if err := ws.GetDb().Where("name = ?", ledgerName).First(&ledger).Error; err != nil {
		return nil, err
	}
	return &ledger, nil
}

func (d *ledgerDaoImpl) DeleteById(ws *workspace.Workspace, ledgerId string) error {
	return ws.GetDb().Where("id = ?", ledgerId).Delete(&models.Ledger{}).Error
}
