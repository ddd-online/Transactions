package dao

import (
	"sync"

	"github.com/billadm/models"
	"github.com/billadm/workspace"
)

var (
	keyEventImageDao     KeyEventImageDao
	keyEventImageDaoOnce sync.Once
)

func GetKeyEventImageDao() KeyEventImageDao {
	if keyEventImageDao != nil {
		return keyEventImageDao
	}
	keyEventImageDaoOnce.Do(func() {
		keyEventImageDao = &keyEventImageDaoImpl{}
	})
	return keyEventImageDao
}

type KeyEventImageDao interface {
	InsertImage(ws *workspace.Workspace, image *models.KeyEventImage) error
	QueryImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error)
	DeleteImage(ws *workspace.Workspace, imageId string) error
	DeleteImagesByEventDate(ws *workspace.Workspace, date string) error
}

var _ KeyEventImageDao = &keyEventImageDaoImpl{}

type keyEventImageDaoImpl struct{}

func (d *keyEventImageDaoImpl) InsertImage(ws *workspace.Workspace, image *models.KeyEventImage) error {
	return ws.GetDb().Create(image).Error
}

func (d *keyEventImageDaoImpl) QueryImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error) {
	var images []models.KeyEventImage
	err := ws.GetDb().Where("event_date = ?", date).Order("sort_order ASC").Find(&images).Error
	return images, err
}

func (d *keyEventImageDaoImpl) DeleteImage(ws *workspace.Workspace, imageId string) error {
	return ws.GetDb().Where("id = ?", imageId).Delete(&models.KeyEventImage{}).Error
}

func (d *keyEventImageDaoImpl) DeleteImagesByEventDate(ws *workspace.Workspace, date string) error {
	return ws.GetDb().Where("event_date = ?", date).Delete(&models.KeyEventImage{}).Error
}
