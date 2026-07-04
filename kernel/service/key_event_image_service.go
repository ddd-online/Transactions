package service

import (
	"sync"

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
		keyEventImageService = &keyEventImageServiceImpl{}
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

type keyEventImageServiceImpl struct{}

func (s *keyEventImageServiceImpl) AddImage(ws *workspace.Workspace, date string, data string, filename string) (*models.KeyEventImage, error) {
	var images []models.KeyEventImage
	if err := ws.GetDb().Where("event_date = ?", date).Order("sort_order ASC").Find(&images).Error; err != nil {
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
	if err := ws.GetDb().Create(image).Error; err != nil {
		return nil, err
	}
	return image, nil
}

func (s *keyEventImageServiceImpl) GetImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error) {
	var images []models.KeyEventImage
	err := ws.GetDb().Where("event_date = ?", date).Order("sort_order ASC").Find(&images).Error
	return images, err
}

func (s *keyEventImageServiceImpl) DeleteImage(ws *workspace.Workspace, imageId string) error {
	return ws.GetDb().Where("id = ?", imageId).Delete(&models.KeyEventImage{}).Error
}

func (s *keyEventImageServiceImpl) DeleteImagesByEventDate(ws *workspace.Workspace, date string) error {
	return ws.GetDb().Where("event_date = ?", date).Delete(&models.KeyEventImage{}).Error
}
