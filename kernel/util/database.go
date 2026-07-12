package util

import (
	"fmt"

	"github.com/sirupsen/logrus"
	"github.com/glebarez/sqlite"
	"gorm.io/gorm"

	"github.com/billadm/models"
)

// NewDbInstance creates a new GORM DB instance and auto-migrates the schema.
func NewDbInstance(dbPath string) (*gorm.DB, error) {
	db, err := gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	if err != nil {
		logrus.Errorf("连接数据库失败, db path: %s, err: %v", dbPath, err)
		return nil, fmt.Errorf("连接数据库失败, db path: %s, err: %w", dbPath, err)
	}

	// Auto-migrate all models
	if err := db.AutoMigrate(
		&models.Ledger{},
		&models.TransactionRecord{},
		&models.TrTag{},
		&models.Category{},
		&models.Tag{},
		&models.TransactionTemplate{},
		&models.Chart{},
		&models.KeyEvent{},
		&models.KeyEventImage{},
		&models.DiaryEntry{},
		&models.AiConfig{},
		&models.AiMessage{},
	); err != nil {
		logrus.Errorf("数据库自动迁移失败, db path: %s, err: %v", dbPath, err)
		return nil, fmt.Errorf("数据库自动迁移失败: %w", err)
	}

	logrus.Infof("连接数据库成功, db path: %s", dbPath)
	return db, nil
}
