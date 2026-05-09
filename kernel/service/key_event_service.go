package service

import (
	"fmt"
	"sync"

	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

var (
	keyEventService     KeyEventService
	keyEventServiceOnce sync.Once
)

func GetKeyEventService() KeyEventService {
	if keyEventService != nil {
		return keyEventService
	}
	keyEventServiceOnce.Do(func() {
		keyEventService = &keyEventServiceImpl{
			keyEventDao: dao.GetKeyEventDao(),
			imageDao:    dao.GetKeyEventImageDao(),
		}
	})
	return keyEventService
}

type KeyEventService interface {
	UpsertKeyEvent(ws *workspace.Workspace, date string, title string, content string, color string) error
	QueryByDate(ws *workspace.Workspace, date string) (*models.KeyEvent, error)
	QueryByYear(ws *workspace.Workspace, year string) ([]models.KeyEvent, error)
	QueryDatesByYear(ws *workspace.Workspace, year string) ([]string, error)
	DeleteByDate(ws *workspace.Workspace, date string) error
}

var _ KeyEventService = &keyEventServiceImpl{}

type keyEventServiceImpl struct {
	keyEventDao dao.KeyEventDao
	imageDao    dao.KeyEventImageDao
}

// UpsertKeyEvent 根据 date 判断是否存在：存在则更新 title、content、color，不存在则新建
func (s *keyEventServiceImpl) UpsertKeyEvent(ws *workspace.Workspace, date string, title string, content string, color string) error {
	if len(title) > 200 {
		title = title[:200]
	}

	existing, err := s.keyEventDao.QueryByDate(ws, date)
	if err != nil && err != gorm.ErrRecordNotFound {
		return err
	}

	if existing != nil {
		// Update
		existing.Title = title
		existing.Content = content
		existing.Color = color
		return s.keyEventDao.UpsertKeyEvent(ws, existing)
	}

	// Create
	event := &models.KeyEvent{
		ID:      util.GetUUID(),
		Date:    date,
		Title:   title,
		Content: content,
		Color:   color,
	}
	return s.keyEventDao.UpsertKeyEvent(ws, event)
}

func (s *keyEventServiceImpl) QueryByDate(ws *workspace.Workspace, date string) (*models.KeyEvent, error) {
	return s.keyEventDao.QueryByDate(ws, date)
}

func (s *keyEventServiceImpl) QueryByYear(ws *workspace.Workspace, year string) ([]models.KeyEvent, error) {
	return s.keyEventDao.QueryByYear(ws, year)
}

func (s *keyEventServiceImpl) QueryDatesByYear(ws *workspace.Workspace, year string) ([]string, error) {
	events, err := s.keyEventDao.QueryByYear(ws, year)
	if err != nil {
		return nil, err
	}
	dates := make([]string, len(events))
	for i, e := range events {
		dates[i] = e.Date
	}
	return dates, nil
}

func (s *keyEventServiceImpl) DeleteByDate(ws *workspace.Workspace, date string) error {
	logrus.Infof("delete key event, date: %s", date)
	return ws.Transaction(func(tx *workspace.Workspace) error {
		if err := s.imageDao.DeleteImagesByEventDate(tx, date); err != nil {
			return fmt.Errorf("delete key event images: %w", err)
		}
		if err := s.keyEventDao.DeleteByDate(tx, date); err != nil {
			return fmt.Errorf("delete key event: %w", err)
		}
		return nil
	})
}
