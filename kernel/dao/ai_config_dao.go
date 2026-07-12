package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

func NewAiConfigDao() AiConfigDao {
	return &aiConfigDaoImpl{}
}

type AiConfigDao interface {
	Get(ws *workspace.Workspace, role string) (*models.AiConfig, error)
	Save(ws *workspace.Workspace, config *models.AiConfig) error
}

var _ AiConfigDao = &aiConfigDaoImpl{}

type aiConfigDaoImpl struct{}

func (d *aiConfigDaoImpl) Get(ws *workspace.Workspace, role string) (*models.AiConfig, error) {
	var config models.AiConfig
	err := ws.GetDb().Where("role = ?", role).First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

func (d *aiConfigDaoImpl) Save(ws *workspace.Workspace, config *models.AiConfig) error {
	var existing models.AiConfig
	err := ws.GetDb().Where("role = ?", config.Role).First(&existing).Error
	if err != nil {
		config.ID = 1
		return ws.GetDb().Create(config).Error
	}
	config.ID = existing.ID
	return ws.GetDb().Model(&existing).Select("base_url", "endpoint", "api_key", "model", "system_prompt", "provider").Updates(config).Error
}
