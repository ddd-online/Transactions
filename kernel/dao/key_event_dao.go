package dao

import (
	"github.com/transactions/models"
	"github.com/transactions/workspace"
	"gorm.io/gorm/clause"
)

type KeyEventDao interface {
	Upsert(ws *workspace.Workspace, event *models.KeyEvent) error
	QueryByDate(ws *workspace.Workspace, ledgerID string, date string) (*models.KeyEvent, error)
	QueryByYear(ws *workspace.Workspace, ledgerID string, year string) ([]models.KeyEvent, error)
	DeleteByDate(ws *workspace.Workspace, ledgerID string, date string) error
	DeleteByLedgerId(ws *workspace.Workspace, ledgerID string) error
}

var _ KeyEventDao = &keyEventDaoImpl{}

type keyEventDaoImpl struct{}

func NewKeyEventDao() KeyEventDao {
	return &keyEventDaoImpl{}
}

func (d *keyEventDaoImpl) Upsert(ws *workspace.Workspace, event *models.KeyEvent) error {
	// 幂等 upsert：以 (ledger_id, date) 复合唯一键冲突时更新字段，避免 select-then-act 竞态
	return ws.GetDb().Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "ledger_id"}, {Name: "date"}},
		DoUpdates: clause.AssignmentColumns([]string{"title", "content", "color", "updated_at"}),
	}).Create(event).Error
}

func (d *keyEventDaoImpl) QueryByDate(ws *workspace.Workspace, ledgerID string, date string) (*models.KeyEvent, error) {
	var event models.KeyEvent
	err := ws.GetDb().Where("ledger_id = ? AND date = ?", ledgerID, date).First(&event).Error
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (d *keyEventDaoImpl) QueryByYear(ws *workspace.Workspace, ledgerID string, year string) ([]models.KeyEvent, error) {
	events := make([]models.KeyEvent, 0)
	err := ws.GetDb().Where("ledger_id = ? AND date LIKE ?", ledgerID, year+"-%").Find(&events).Error
	return events, err
}

func (d *keyEventDaoImpl) DeleteByDate(ws *workspace.Workspace, ledgerID string, date string) error {
	return ws.GetDb().Where("ledger_id = ? AND date = ?", ledgerID, date).Delete(&models.KeyEvent{}).Error
}

func (d *keyEventDaoImpl) DeleteByLedgerId(ws *workspace.Workspace, ledgerID string) error {
	return ws.GetDb().Where("ledger_id = ?", ledgerID).Delete(&models.KeyEvent{}).Error
}
