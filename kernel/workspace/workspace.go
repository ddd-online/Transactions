package workspace

import (
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"
	"gorm.io/gorm"

	"github.com/billadm/constant"
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
		logrus.Error(err)
	}
	err = sqlDb.Close()
	if err != nil {
		logrus.Error(err)
	}
}
