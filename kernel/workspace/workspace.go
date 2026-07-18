package workspace

import (
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"
	"gorm.io/gorm"

	"github.com/billadm/constant"
	"github.com/billadm/models"
	"github.com/billadm/util"
)

type Workspace struct {
	directory string
	db        *gorm.DB
}

func NewWorkspace(directory string) (*Workspace, error) {
	if !util.IsDirectoryExists(directory) {
		err := os.MkdirAll(directory, 0750)
		if err != nil {
			return nil, err
		}
	}
	// Initialize db with auto-migration
	dbFile := filepath.Join(directory, constant.DbName)
	db, err := util.NewDbInstance(dbFile)
	if err != nil {
		return nil, err
	}

	// Auto-migrate AI tables
	if err := db.AutoMigrate(&models.AiConfig{}); err != nil {
		return nil, err
	}
	if err := db.AutoMigrate(&models.AiApiConfig{}); err != nil {
		return nil, err
	}
	if err := db.AutoMigrate(&models.AiMessage{}); err != nil {
		return nil, err
	}

	// 迁移旧数据：将旧 AiConfig 中的连接字段复制到新 AiApiConfig 表
	migrateAiConfig(db)

	return &Workspace{
		directory: directory,
		db:        db,
	}, nil
}

func (w *Workspace) GetDb() *gorm.DB {
	return w.db
}

func (w *Workspace) GetDirectory() string {
	return w.directory
}

// Transaction executes fn within a database transaction.
// If fn returns an error, the transaction is rolled back.
// If fn succeeds, the transaction is committed.
func (w *Workspace) Transaction(fn func(tx *Workspace) error) error {
	return w.db.Transaction(func(tx *gorm.DB) error {
		txWorkspace := &Workspace{
			directory: w.directory,
			db:        tx,
		}
		return fn(txWorkspace)
	})
}

func (w *Workspace) Close() {
	sqlDb, err := w.db.DB()
	if err != nil {
		logrus.Errorf("获取 sql.DB 失败: %v", err)
	}
	err = sqlDb.Close()
	if err != nil {
		logrus.Errorf("关闭数据库连接失败: %v", err)
	}
}

// migrateAiConfig 将旧版 AiConfig 表中的 API 连接配置迁移到新的 AiApiConfig 表。
func migrateAiConfig(db *gorm.DB) {
	var count int64
	db.Table("tbl_billadm_ai_api_config").Count(&count)
	if count > 0 {
		return
	}

	// 读取旧表数据 — 只查有 provider 且有连接信息的记录
	type oldRow struct {
		Provider string
		BaseURL  string
		Endpoint string
		APIKey   string
		Model    string
	}
	var rows []oldRow
	if err := db.Table("tbl_billadm_ai_config").
		Select("provider, base_url, endpoint, api_key, model").
		Where("provider != ''").
		Group("provider").
		Find(&rows).Error; err != nil {
		logrus.Warnf("迁移 AI 配置失败: %v", err)
		return
	}

	for _, r := range rows {
		apiConfig := &models.AiApiConfig{
			Provider: r.Provider,
			BaseURL:  r.BaseURL,
			Endpoint: r.Endpoint,
			APIKey:   r.APIKey,
			Model:    r.Model,
		}
		if err := db.Create(apiConfig).Error; err != nil {
			logrus.Warnf("迁移 AI API 配置 %s 失败: %v", r.Provider, err)
		}
	}
}
