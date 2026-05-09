package service

import (
	"sync"

	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
)

var (
	keyEventImageService     KeyEventImageService
	keyEventImageServiceOnce sync.Once
)

func GetKeyEventImageService() KeyEventImageService {
	if keyEventImageService != nil {
		return keyEventImageService
	}
	keyEventImageServiceOnce.Do(func() {
		keyEventImageService = &keyEventImageServiceImpl{
			imageDao: dao.GetKeyEventImageDao(),
		}
	})
	return keyEventImageService
}

type KeyEventImageService interface {
	AddImage(ws *workspace.Workspace, date string, data string, filename string) (*models.KeyEventImage, error)
	GetImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error)
	DeleteImage(ws *workspace.Workspace, imageId string) error
	DeleteImagesByEventDate(ws *workspace.Workspace, date string) error
}

var _ KeyEventImageService = &keyEventImageServiceImpl{}

type keyEventImageServiceImpl struct {
	imageDao dao.KeyEventImageDao
}

func (s *keyEventImageServiceImpl) AddImage(ws *workspace.Workspace, date string, data string, filename string) (*models.KeyEventImage, error) {
	images, err := s.imageDao.QueryImagesByEventDate(ws, date)
	if err != nil {
		return nil, err
	}
	sortOrder := len(images) + 1
	image := &models.KeyEventImage{
		ID:        util.GetUUID(),
		EventDate: date,
		Data:      data,
		Filename:  filename,
		SortOrder: sortOrder,
	}
	if err := s.imageDao.InsertImage(ws, image); err != nil {
		return nil, err
	}
	return image, nil
}

func (s *keyEventImageServiceImpl) GetImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error) {
	return s.imageDao.QueryImagesByEventDate(ws, date)
}

func (s *keyEventImageServiceImpl) DeleteImage(ws *workspace.Workspace, imageId string) error {
	return s.imageDao.DeleteImage(ws, imageId)
}

func (s *keyEventImageServiceImpl) DeleteImagesByEventDate(ws *workspace.Workspace, date string) error {
	return s.imageDao.DeleteImagesByEventDate(ws, date)
}
