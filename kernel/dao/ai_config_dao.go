package dao

import (
	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

func NewAiConfigDao() AiConfigDao {
	return &aiConfigDaoImpl{}
}

type AiConfigDao interface {
	Get(ws *workspace.Workspace) (*models.AiConfig, error)
	Save(ws *workspace.Workspace, config *models.AiConfig) error
}

var _ AiConfigDao = &aiConfigDaoImpl{}

type aiConfigDaoImpl struct{}

func (d *aiConfigDaoImpl) Get(ws *workspace.Workspace) (*models.AiConfig, error) {
	var config models.AiConfig
	err := ws.GetDb().First(&config).Error
	if err != nil {
		return nil, err
	}
	return &config, nil
}

func (d *aiConfigDaoImpl) Save(ws *workspace.Workspace, config *models.AiConfig) error {
	// 单行配置表：先查是否存在，存在则更新，不存在则创建
	var existing models.AiConfig
	err := ws.GetDb().First(&existing).Error
	if err != nil {
		// 不存在，创建
		config.ID = 1
		return ws.GetDb().Create(config).Error
	}
	// 存在，更新
	config.ID = existing.ID
	return ws.GetDb().Model(&existing).Select("base_url", "endpoint", "api_key", "model", "system_prompt").Updates(config).Error
}
