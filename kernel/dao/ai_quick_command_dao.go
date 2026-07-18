package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
	"gorm.io/gorm"
)

func NewAiQuickCommandDao() AiQuickCommandDao {
	return &aiQuickCommandDaoImpl{}
}

type AiQuickCommandDao interface {
	List(ws *workspace.Workspace, role string) ([]*models.AiQuickCommand, error)
	ReplaceAll(ws *workspace.Workspace, role string, commands []*models.AiQuickCommand) error
}

var _ AiQuickCommandDao = &aiQuickCommandDaoImpl{}

type aiQuickCommandDaoImpl struct{}

func (d *aiQuickCommandDaoImpl) List(ws *workspace.Workspace, role string) ([]*models.AiQuickCommand, error) {
	var commands []*models.AiQuickCommand
	err := ws.GetDb().Where("role = ?", role).Order("sort_order asc").Find(&commands).Error
	if err != nil {
		return nil, err
	}
	return commands, nil
}

func (d *aiQuickCommandDaoImpl) ReplaceAll(ws *workspace.Workspace, role string, commands []*models.AiQuickCommand) error {
	return ws.GetDb().Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("role = ?", role).Delete(&models.AiQuickCommand{}).Error; err != nil {
			return err
		}
		if len(commands) > 0 {
			if err := tx.Create(&commands).Error; err != nil {
				return err
			}
		}
		return nil
	})
}
