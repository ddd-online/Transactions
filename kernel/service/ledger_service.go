package service

import (
	"fmt"

	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

func NewLedgerService(
	ledgerDao dao.LedgerDao,
	trDao dao.TransactionRecordDao,
	trTagDao dao.TrTagDao,
	categoryDao dao.CategoryDao,
	tagDao dao.TagDao,
	chartDao dao.ChartDao,
	trTemplateDao dao.TransactionTemplateDao,
	keyEventDao dao.KeyEventDao,
	keyEventImageDao dao.KeyEventImageDao,
) LedgerService {
	return &ledgerServiceImpl{
		ledgerDao:        ledgerDao,
		trDao:            trDao,
		trTagDao:         trTagDao,
		categoryDao:      categoryDao,
		tagDao:           tagDao,
		chartDao:         chartDao,
		trTemplateDao:    trTemplateDao,
		keyEventDao:      keyEventDao,
		keyEventImageDao: keyEventImageDao,
	}
}

type LedgerService interface {
	CreateLedger(ws *workspace.Workspace, ledgerName string, description string) (string, error)
	ModifyLedger(ws *workspace.Workspace, ledgerId, ledgerName, description string) error
	ListAllLedger(ws *workspace.Workspace) ([]models.Ledger, error)
	QueryLedgerById(ws *workspace.Workspace, ledgerId string) (*models.Ledger, error)
	QueryLedgerByName(ws *workspace.Workspace, ledgerName string) (*models.Ledger, error)
	DeleteLedgerById(ws *workspace.Workspace, ledgerId string) error
}

var _ LedgerService = &ledgerServiceImpl{}

type ledgerServiceImpl struct {
	ledgerDao        dao.LedgerDao
	trDao            dao.TransactionRecordDao
	trTagDao         dao.TrTagDao
	categoryDao      dao.CategoryDao
	tagDao           dao.TagDao
	chartDao         dao.ChartDao
	trTemplateDao    dao.TransactionTemplateDao
	keyEventDao      dao.KeyEventDao
	keyEventImageDao dao.KeyEventImageDao
}

func (l *ledgerServiceImpl) CreateLedger(ws *workspace.Workspace, ledgerName string, description string) (string, error) {
	ledger := &models.Ledger{
		ID:          util.GetUUID(),
		Name:        ledgerName,
		Description: description,
	}

	if err := l.ledgerDao.Create(ws, ledger); err != nil {
		logrus.Errorf("创建账本失败, name: %s, err: %v", ledgerName, err)
		return "", err
	}

	return ledger.ID, nil
}

func (l *ledgerServiceImpl) ModifyLedger(ws *workspace.Workspace, ledgerId, ledgerName, description string) error {
	ledger := &models.Ledger{
		ID:          ledgerId,
		Name:        ledgerName,
		Description: description,
	}

	if err := l.ledgerDao.Update(ws, ledger); err != nil {
		logrus.Errorf("修改账本失败, id: %s, err: %v", ledgerId, err)
		return err
	}

	return nil
}

func (l *ledgerServiceImpl) ListAllLedger(ws *workspace.Workspace) ([]models.Ledger, error) {
	ledgers, err := l.ledgerDao.ListAll(ws)
	if err != nil {
		logrus.Errorf("列出账本失败, err: %v", err)
		return nil, err
	}

	return ledgers, nil
}

func (l *ledgerServiceImpl) QueryLedgerById(ws *workspace.Workspace, ledgerId string) (*models.Ledger, error) {
	ledger, err := l.ledgerDao.QueryById(ws, ledgerId)
	if err != nil {
		logrus.Errorf("按 ID 查询账本失败, id: %s, err: %v", ledgerId, err)
		return nil, err
	}

	return ledger, nil
}

func (l *ledgerServiceImpl) QueryLedgerByName(ws *workspace.Workspace, ledgerName string) (*models.Ledger, error) {
	ledger, err := l.ledgerDao.QueryByName(ws, ledgerName)
	if err != nil {
		logrus.Errorf("按名称查询账本失败, name: %s, err: %v", ledgerName, err)
		return nil, err
	}

	return ledger, nil
}

func (l *ledgerServiceImpl) DeleteLedgerById(ws *workspace.Workspace, ledgerId string) error {
	// 事务前收集该账本的图片文件路径，用于事务提交后的磁盘清理
	images, err := l.keyEventImageDao.QueryByLedgerId(ws, ledgerId)
	if err != nil {
		return fmt.Errorf("query key event images: %w", err)
	}
	imageFiles := make([][2]string, 0, len(images))
	for _, img := range images {
		imageFiles = append(imageFiles, [2]string{img.FilePath, img.ThumbPath})
	}

	err = ws.Transaction(func(tx *workspace.Workspace) error {
		if err := l.trTagDao.DeleteByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete tr tags: %w", err)
		}
		if err := l.trDao.DeleteAllByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete trs: %w", err)
		}
		if err := l.categoryDao.DeleteByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete categories: %w", err)
		}
		if err := l.tagDao.DeleteByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete tags: %w", err)
		}
		if err := l.chartDao.DeleteByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete charts: %w", err)
		}
		if err := l.trTemplateDao.DeleteByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete templates: %w", err)
		}
		if err := l.keyEventImageDao.DeleteByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete key event images: %w", err)
		}
		if err := l.keyEventDao.DeleteByLedgerId(tx, ledgerId); err != nil {
			return fmt.Errorf("delete key events: %w", err)
		}
		if err := l.ledgerDao.DeleteById(tx, ledgerId); err != nil {
			return fmt.Errorf("delete ledger: %w", err)
		}
		return nil
	})

	if err != nil {
		logrus.Errorf("删除账本失败, id: %s, err: %v", ledgerId, err)
		return err
	}

	// 事务提交成功后再删除磁盘上的图片文件，避免删库成功但删文件失败导致记录缺失
	for _, p := range imageFiles {
		removeImageFiles(ws.GetDirectory(), p[0], p[1])
	}
	return nil
}
