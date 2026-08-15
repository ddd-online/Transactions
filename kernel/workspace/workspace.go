package workspace

import (
	"os"
	"path/filepath"
	"sync"

	"github.com/sirupsen/logrus"
	"gorm.io/gorm"

	"github.com/transactions/constant"
	"github.com/transactions/util"
)

// legacyDbName 旧版数据库文件名。曾用 billadm.db，后统一为 transactions.db；
// 打开工作空间时发现旧文件会自动重命名迁移，避免存量数据丢失。
const legacyDbName = "billadm.db"

type Workspace struct {
	directory string
	db        *gorm.DB
	closeOnce sync.Once
}

func NewWorkspace(directory string) (*Workspace, error) {
	if !util.IsDirectoryExists(directory) {
		err := os.MkdirAll(directory, 0750)
		if err != nil {
			return nil, err
		}
	}
	// 兼容旧版数据库文件名：billadm.db → transactions.db（含 WAL/SHM 伴生文件）
	migrateLegacyDbFile(directory)
	// Initialize db with auto-migration
	dbFile := filepath.Join(directory, constant.DbName)
	db, err := util.NewDbInstance(dbFile)
	if err != nil {
		return nil, err
	}

	return &Workspace{
		directory: directory,
		db:        db,
	}, nil
}

// migrateLegacyDbFile 将旧版 billadm.db 重命名为 transactions.db。
// 仅当新文件不存在时执行，重复打开幂等；SQLite WAL 模式下的 -wal/-shm 伴生文件一并迁移。
func migrateLegacyDbFile(directory string) {
	legacy := filepath.Join(directory, legacyDbName)
	if _, err := os.Stat(legacy); err != nil {
		return // 无旧文件（全新工作空间或已迁移）
	}
	target := filepath.Join(directory, constant.DbName)
	if _, err := os.Stat(target); err == nil {
		logrus.Warnf("发现旧数据库 %s 与新数据库 %s 并存，保留新库，旧库请手动确认", legacyDbName, constant.DbName)
		return
	}
	for _, suffix := range []string{"", "-wal", "-shm"} {
		oldPath := legacy + suffix
		newPath := target + suffix
		if _, err := os.Stat(oldPath); err != nil {
			continue
		}
		if err := os.Rename(oldPath, newPath); err != nil {
			logrus.Errorf("迁移旧数据库文件 %s 失败: %v", filepath.Base(oldPath), err)
			return
		}
	}
	logrus.Infof("已将旧数据库 %s 迁移为 %s", legacyDbName, constant.DbName)
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
	w.closeOnce.Do(func() {
		sqlDb, err := w.db.DB()
		if err != nil {
			logrus.Errorf("获取 sql.DB 失败: %v", err)
			return
		}
		if err := sqlDb.Close(); err != nil {
			logrus.Errorf("关闭数据库连接失败: %v", err)
		}
	})
}
