package service

import (
	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
)

func NewKeyEventImageService(keyEventImageDao dao.KeyEventImageDao) KeyEventImageService {
	return &keyEventImageServiceImpl{
		keyEventImageDao: keyEventImageDao,
	}
}

type KeyEventImageService interface {
	AddImage(ws *workspace.Workspace, date string, data string, filename string) (*models.KeyEventImage, error)
	GetImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error)
	DeleteImage(ws *workspace.Workspace, imageId string) error
	DeleteImagesByEventDate(ws *workspace.Workspace, date string) error
}

var _ KeyEventImageService = &keyEventImageServiceImpl{}

type keyEventImageServiceImpl struct {
	keyEventImageDao dao.KeyEventImageDao
}

func (s *keyEventImageServiceImpl) AddImage(ws *workspace.Workspace, date string, data string, filename string) (*models.KeyEventImage, error) {
	images, err := s.keyEventImageDao.QueryByEventDate(ws, date)
	if err != nil {
		return nil, err
	}
	maxOrder := 0
	for _, img := range images {
		if img.SortOrder > maxOrder {
			maxOrder = img.SortOrder
		}
	}
	sortOrder := maxOrder + 1
	image := &models.KeyEventImage{
		ID:        util.GetUUID(),
		EventDate: date,
		Data:      data,
		Filename:  filename,
		SortOrder: sortOrder,
	}
	if err := s.keyEventImageDao.Create(ws, image); err != nil {
		return nil, err
	}
	return image, nil
}

func (s *keyEventImageServiceImpl) GetImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error) {
	return s.keyEventImageDao.QueryByEventDate(ws, date)
}

func (s *keyEventImageServiceImpl) DeleteImage(ws *workspace.Workspace, imageId string) error {
	return s.keyEventImageDao.DeleteById(ws, imageId)
}

func (s *keyEventImageServiceImpl) DeleteImagesByEventDate(ws *workspace.Workspace, date string) error {
	return s.keyEventImageDao.DeleteByEventDate(ws, date)
}
