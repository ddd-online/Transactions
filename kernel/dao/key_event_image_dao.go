package dao

import (
	"github.com/transactions/models"
	"github.com/transactions/workspace"
)

type KeyEventImageDao interface {
	Create(ws *workspace.Workspace, image *models.KeyEventImage) error
	QueryByEventDate(ws *workspace.Workspace, ledgerId string, date string) ([]models.KeyEventImage, error)
	QueryByLedgerId(ws *workspace.Workspace, ledgerId string) ([]models.KeyEventImage, error)
	DeleteById(ws *workspace.Workspace, imageId string) error
	DeleteByEventDate(ws *workspace.Workspace, ledgerId string, date string) error
	DeleteByLedgerId(ws *workspace.Workspace, ledgerId string) error
	QueryById(ws *workspace.Workspace, imageId string) (*models.KeyEventImage, error)
}

var _ KeyEventImageDao = &keyEventImageDaoImpl{}

type keyEventImageDaoImpl struct{}

func NewKeyEventImageDao() KeyEventImageDao {
	return &keyEventImageDaoImpl{}
}

func (d *keyEventImageDaoImpl) Create(ws *workspace.Workspace, image *models.KeyEventImage) error {
	return ws.GetDb().Create(image).Error
}

func (d *keyEventImageDaoImpl) QueryById(ws *workspace.Workspace, imageId string) (*models.KeyEventImage, error) {
	var image models.KeyEventImage
	err := ws.GetDb().Where("id = ?", imageId).First(&image).Error
	if err != nil {
		return nil, err
	}
	return &image, nil
}

func (d *keyEventImageDaoImpl) QueryByEventDate(ws *workspace.Workspace, ledgerId string, date string) ([]models.KeyEventImage, error) {
	var images []models.KeyEventImage
	err := ws.GetDb().
		Where("ledger_id = ? AND event_date = ?", ledgerId, date).
		Order("sort_order ASC").
		Find(&images).Error
	return images, err
}

func (d *keyEventImageDaoImpl) QueryByLedgerId(ws *workspace.Workspace, ledgerId string) ([]models.KeyEventImage, error) {
	var images []models.KeyEventImage
	err := ws.GetDb().Where("ledger_id = ?", ledgerId).Order("sort_order ASC").Find(&images).Error
	return images, err
}

func (d *keyEventImageDaoImpl) DeleteById(ws *workspace.Workspace, imageId string) error {
	return ws.GetDb().Where("id = ?", imageId).Delete(&models.KeyEventImage{}).Error
}

func (d *keyEventImageDaoImpl) DeleteByEventDate(ws *workspace.Workspace, ledgerId string, date string) error {
	return ws.GetDb().Where("ledger_id = ? AND event_date = ?", ledgerId, date).Delete(&models.KeyEventImage{}).Error
}

func (d *keyEventImageDaoImpl) DeleteByLedgerId(ws *workspace.Workspace, ledgerId string) error {
	return ws.GetDb().Where("ledger_id = ?", ledgerId).Delete(&models.KeyEventImage{}).Error
}
