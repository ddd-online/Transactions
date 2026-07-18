package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

func NewAiApiConfigDao() AiApiConfigDao {
	return &aiApiConfigDaoImpl{}
}

type AiApiConfigDao interface {
	Get(ws *workspace.Workspace, provider string) (*models.AiApiConfig, error)
	Save(ws *workspace.Workspace, config *models.AiApiConfig) error
}

type aiApiConfigDaoImpl struct{}

func (d *aiApiConfigDaoImpl) Get(ws *workspace.Workspace, provider string) (*models.AiApiConfig, error) {
	var config models.AiApiConfig
	err := ws.GetDb().Where("provider = ?", provider).First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

func (d *aiApiConfigDaoImpl) Save(ws *workspace.Workspace, config *models.AiApiConfig) error {
	var existing models.AiApiConfig
	err := ws.GetDb().Where("provider = ?", config.Provider).First(&existing).Error
	if err != nil {
		return ws.GetDb().Create(config).Error
	}
	return ws.GetDb().Model(&models.AiApiConfig{}).Where("id = ?", existing.ID).Updates(map[string]interface{}{
		"base_url": config.BaseURL,
		"endpoint": config.Endpoint,
		"api_key":  config.APIKey,
		"model":    config.Model,
	}).Error
}
