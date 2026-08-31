package util

import (
	"fmt"
	"time"

	"github.com/glebarez/sqlite"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/transactions/models"
)

// NewDbInstance creates a new GORM DB instance and auto-migrates the schema.
func NewDbInstance(dbPath string) (*gorm.DB, error) {
	// SQLite 连接参数：
	//   - journal_mode(WAL)：读并发 + 写不阻塞读，桌面端多请求场景下避免锁冲突
	//   - busy_timeout(5000)：写锁被占用时等待 5s，而不是立刻报 "database is locked"
	//   - synchronous(NORMAL)：WAL 下足够安全，写入性能明显优于 FULL
	//   - foreign_keys(ON)：为后续外键约束铺路（当前模型未定义 FK，无影响）
	dsn := fmt.Sprintf("%s?_pragma=busy_timeout(5000)&_pragma=journal_mode(WAL)&_pragma=synchronous(NORMAL)&_pragma=foreign_keys(ON)", dbPath)
	db, err := gorm.Open(sqlite.Open(dsn), &gorm.Config{
		// GORM 默认慢查询阈值 200ms，Warn 级别自动输出慢 SQL，便于发现性能回归
		Logger: logger.Default.LogMode(logger.Warn),
	})
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
		&models.StockAccount{},
		&models.StockFeeSetting{},
		&models.StockFundRecord{},
		&models.StockPosition{},
		&models.StockTrade{},
		&models.AiConfig{},
		&models.AiApiConfig{},
		&models.AiMessage{},
		&models.AiConversation{},
		&models.AiQuickCommand{},
	); err != nil {
		logrus.Errorf("数据库自动迁移失败, db path: %s, err: %v", dbPath, err)
		return nil, fmt.Errorf("数据库自动迁移失败: %w", err)
	}

	// 版本化迁移：AutoMigrate 只负责"加字段/加索引"这类增量变更，
	// 破坏性/数据回填等操作必须走 Migrate（见 util/migrate.go）。
	if err := Migrate(db, Migrations()); err != nil {
		logrus.Errorf("数据库版本迁移失败, db path: %s, err: %v", dbPath, err)
		return nil, fmt.Errorf("数据库版本迁移失败: %w", err)
	}

	// 连接池：桌面应用小池子足够；WAL 允许并发读，写入由 SQLite 自行串行化。
	// 过大的连接数反而会放大锁竞争，1 写多读场景下 4 个连接是合理值。
	sqlDB, err := db.DB()
	if err != nil {
		logrus.Errorf("获取 sql.DB 失败: %v", err)
		return nil, fmt.Errorf("获取 sql.DB 失败: %w", err)
	}
	sqlDB.SetMaxOpenConns(4)
	sqlDB.SetMaxIdleConns(4)
	sqlDB.SetConnMaxIdleTime(30 * time.Minute)

	logrus.Infof("连接数据库成功, db path: %s", dbPath)
	return db, nil
}
