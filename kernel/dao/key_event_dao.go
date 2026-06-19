package dao

import (
	"sync"

	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

var (
	keyEventDao     KeyEventDao
	keyEventDaoOnce sync.Once
)

func GetKeyEventDao() KeyEventDao {
	if keyEventDao != nil {
		return keyEventDao
	}
	keyEventDaoOnce.Do(func() {
		keyEventDao = &keyEventDaoImpl{}
	})
	return keyEventDao
}

type KeyEventDao interface {
	UpsertKeyEvent(ws *workspace.Workspace, event *models.KeyEvent) error
	QueryByDate(ws *workspace.Workspace, ledgerID string, date string) (*models.KeyEvent, error)
	QueryByYear(ws *workspace.Workspace, ledgerID string, year string) ([]models.KeyEvent, error)
	DeleteByDate(ws *workspace.Workspace, ledgerID string, date string) error
}

var _ KeyEventDao = &keyEventDaoImpl{}

type keyEventDaoImpl struct{}

func (k *keyEventDaoImpl) UpsertKeyEvent(ws *workspace.Workspace, event *models.KeyEvent) error {
	return ws.GetDb().Save(event).Error
}

func (k *keyEventDaoImpl) QueryByDate(ws *workspace.Workspace, ledgerID string, date string) (*models.KeyEvent, error) {
	var event models.KeyEvent
	err := ws.GetDb().Where("ledger_id = ? AND date = ?", ledgerID, date).First(&event).Error
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (k *keyEventDaoImpl) QueryByYear(ws *workspace.Workspace, ledgerID string, year string) ([]models.KeyEvent, error) {
	events := make([]models.KeyEvent, 0)
	err := ws.GetDb().Where("ledger_id = ? AND date LIKE ?", ledgerID, year+"-%").Find(&events).Error
	return events, err
}

func (k *keyEventDaoImpl) DeleteByDate(ws *workspace.Workspace, ledgerID string, date string) error {
	return ws.GetDb().Where("ledger_id = ? AND date = ?", ledgerID, date).Delete(&models.KeyEvent{}).Error
}
