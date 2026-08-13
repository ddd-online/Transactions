package service

import (
	"fmt"
	"unicode/utf8"

	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

func NewKeyEventService(imageService KeyEventImageService, keyEventDao dao.KeyEventDao) KeyEventService {
	return &keyEventServiceImpl{
		imageService: imageService,
		keyEventDao:  keyEventDao,
	}
}

type KeyEventService interface {
	UpsertKeyEvent(ws *workspace.Workspace, ledgerID string, date string, title string, content string, color string) error
	QueryByDate(ws *workspace.Workspace, ledgerID string, date string) (*models.KeyEvent, error)
	QueryByYear(ws *workspace.Workspace, ledgerID string, year string) ([]models.KeyEvent, error)
	QueryDatesByYear(ws *workspace.Workspace, ledgerID string, year string) ([]string, error)
	DeleteByDate(ws *workspace.Workspace, ledgerID string, date string) error
}

var _ KeyEventService = &keyEventServiceImpl{}

type keyEventServiceImpl struct {
	imageService KeyEventImageService
	keyEventDao  dao.KeyEventDao
}

func (s *keyEventServiceImpl) UpsertKeyEvent(ws *workspace.Workspace, ledgerID string, date string, title string, content string, color string) error {
	// 按 rune 截断，避免在多字节 UTF-8（如中文）中间切断产生非法字符
	if utf8.RuneCountInString(title) > 200 {
		title = string([]rune(title)[:200])
	}

	// DAO 层用 OnConflict 幂等 upsert，无需先查再写
	event := &models.KeyEvent{
		ID:       util.GetUUID(),
		Date:     date,
		Title:    title,
		Content:  content,
		Color:    color,
		LedgerID: ledgerID,
	}
	return s.keyEventDao.Upsert(ws, event)
}

func (s *keyEventServiceImpl) QueryByDate(ws *workspace.Workspace, ledgerID string, date string) (*models.KeyEvent, error) {
	return s.keyEventDao.QueryByDate(ws, ledgerID, date)
}

func (s *keyEventServiceImpl) QueryByYear(ws *workspace.Workspace, ledgerID string, year string) ([]models.KeyEvent, error) {
	return s.keyEventDao.QueryByYear(ws, ledgerID, year)
}

func (s *keyEventServiceImpl) QueryDatesByYear(ws *workspace.Workspace, ledgerID string, year string) ([]string, error) {
	events, err := s.keyEventDao.QueryByYear(ws, ledgerID, year)
	if err != nil {
		return nil, err
	}
	dates := make([]string, len(events))
	for i, e := range events {
		dates[i] = e.Date
	}
	return dates, nil
}

func (s *keyEventServiceImpl) DeleteByDate(ws *workspace.Workspace, ledgerID string, date string) error {
	logrus.Infof("删除关键事件, 日期: %s", date)

	images, err := s.imageService.GetImagesByEventDate(ws, ledgerID, date)
	if err != nil {
		return fmt.Errorf("query images: %w", err)
	}

	if err := ws.Transaction(func(tx *workspace.Workspace) error {
		if err := s.imageService.DeleteImageRecordsByEventDate(tx, ledgerID, date); err != nil {
			return fmt.Errorf("delete image records: %w", err)
		}
		if err := s.keyEventDao.DeleteByDate(tx, ledgerID, date); err != nil {
			return fmt.Errorf("delete key event: %w", err)
		}
		return nil
	}); err != nil {
		return err
	}

	for i := range images {
		removeImageFiles(ws.GetDirectory(), images[i].FilePath, images[i].ThumbPath)
	}
	return nil
}
