package service

import (
	"os"
	"path/filepath"

	"github.com/sirupsen/logrus"

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
	AddImage(ws *workspace.Workspace, date string, data string) (*models.KeyEventImage, error)
	GetImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error)
	DeleteImage(ws *workspace.Workspace, imageId string) error
	DeleteImagesByEventDate(ws *workspace.Workspace, date string) error
}

var _ KeyEventImageService = &keyEventImageServiceImpl{}

type keyEventImageServiceImpl struct {
	keyEventImageDao dao.KeyEventImageDao
}

func (s *keyEventImageServiceImpl) AddImage(ws *workspace.Workspace, date string, data string) (*models.KeyEventImage, error) {
	imageId := util.GetUUID()

	filePath, thumbPath, err := util.SaveImage(ws.GetDirectory(), date, imageId, data)
	if err != nil {
		return nil, err
	}

	images, err := s.keyEventImageDao.QueryByEventDate(ws, date)
	if err != nil {
		_ = os.Remove(filepath.Join(ws.GetDirectory(), "data", "assets", filePath))
		_ = os.Remove(filepath.Join(ws.GetDirectory(), "data", "assets", thumbPath))
		return nil, err
	}

	maxOrder := 0
	for _, img := range images {
		if img.SortOrder > maxOrder {
			maxOrder = img.SortOrder
		}
	}

	image := &models.KeyEventImage{
		ID:        imageId,
		EventDate: date,
		FilePath:  filePath,
		ThumbPath: thumbPath,
		SortOrder: maxOrder + 1,
	}
	if err := s.keyEventImageDao.Create(ws, image); err != nil {
		_ = os.Remove(filepath.Join(ws.GetDirectory(), "data", "assets", filePath))
		_ = os.Remove(filepath.Join(ws.GetDirectory(), "data", "assets", thumbPath))
		return nil, err
	}
	return image, nil
}

func (s *keyEventImageServiceImpl) GetImagesByEventDate(ws *workspace.Workspace, date string) ([]models.KeyEventImage, error) {
	return s.keyEventImageDao.QueryByEventDate(ws, date)
}

func (s *keyEventImageServiceImpl) DeleteImage(ws *workspace.Workspace, imageId string) error {
	image, err := s.keyEventImageDao.QueryById(ws, imageId)
	if err == nil {
		removeImageFiles(ws.GetDirectory(), image.FilePath, image.ThumbPath)
	}
	return s.keyEventImageDao.DeleteById(ws, imageId)
}

func (s *keyEventImageServiceImpl) DeleteImagesByEventDate(ws *workspace.Workspace, date string) error {
	images, err := s.keyEventImageDao.QueryByEventDate(ws, date)
	if err != nil {
		return err
	}
	for i := range images {
		removeImageFiles(ws.GetDirectory(), images[i].FilePath, images[i].ThumbPath)
	}
	return s.keyEventImageDao.DeleteByEventDate(ws, date)
}

func removeImageFiles(dir, filePath, thumbPath string) {
	if filePath != "" {
		if err := os.Remove(filepath.Join(dir, "data", "assets", filePath)); err != nil && !os.IsNotExist(err) {
			logrus.Warnf("删除原图文件失败: %s, err: %v", filePath, err)
		}
	}
	if thumbPath != "" {
		if err := os.Remove(filepath.Join(dir, "data", "assets", thumbPath)); err != nil && !os.IsNotExist(err) {
			logrus.Warnf("删除缩略图文件失败: %s, err: %v", thumbPath, err)
		}
	}
}
