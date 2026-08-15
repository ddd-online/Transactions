package dao

import (
	"github.com/transactions/models"
	"github.com/transactions/workspace"
	"gorm.io/gorm/clause"
)

type DiaryDao interface {
	ListDates(ws *workspace.Workspace) ([]models.DiaryEntry, error)
	ListDatesByKeyword(ws *workspace.Workspace, keyword string) ([]models.DiaryEntry, error)
	ListAll(ws *workspace.Workspace) ([]models.DiaryEntry, error)
	QueryByDate(ws *workspace.Workspace, date string) (*models.DiaryEntry, error)
	Upsert(ws *workspace.Workspace, entry *models.DiaryEntry) error
	DeleteByDate(ws *workspace.Workspace, date string) error
}

var _ DiaryDao = &diaryDaoImpl{}

type diaryDaoImpl struct{}

func NewDiaryDao() DiaryDao {
	return &diaryDaoImpl{}
}

func (d *diaryDaoImpl) ListDates(ws *workspace.Workspace) ([]models.DiaryEntry, error) {
	var entries []models.DiaryEntry
	err := ws.GetDb().Model(&models.DiaryEntry{}).
		Select("date, word_count, mood").
		Order("date DESC").
		Find(&entries).Error
	if err != nil {
		return nil, err
	}
	return entries, nil
}

func (d *diaryDaoImpl) ListDatesByKeyword(ws *workspace.Workspace, keyword string) ([]models.DiaryEntry, error) {
	var entries []models.DiaryEntry
	err := ws.GetDb().Model(&models.DiaryEntry{}).
		Select("date, word_count, mood").
		Where("instr(content, ?) > 0", keyword).
		Order("date DESC").
		Find(&entries).Error
	if err != nil {
		return nil, err
	}
	return entries, nil
}

func (d *diaryDaoImpl) ListAll(ws *workspace.Workspace) ([]models.DiaryEntry, error) {
	var entries []models.DiaryEntry
	err := ws.GetDb().Model(&models.DiaryEntry{}).
		Order("date ASC").
		Find(&entries).Error
	if err != nil {
		return nil, err
	}
	return entries, nil
}

func (d *diaryDaoImpl) QueryByDate(ws *workspace.Workspace, date string) (*models.DiaryEntry, error) {
	var entry models.DiaryEntry
	err := ws.GetDb().Where("date = ?", date).First(&entry).Error
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

func (d *diaryDaoImpl) Upsert(ws *workspace.Workspace, entry *models.DiaryEntry) error {
	return ws.GetDb().Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "date"}},
		DoUpdates: clause.AssignmentColumns([]string{"content", "word_count", "mood"}),
	}).Create(entry).Error
}

func (d *diaryDaoImpl) DeleteByDate(ws *workspace.Workspace, date string) error {
	result := ws.GetDb().Where("date = ?", date).Delete(&models.DiaryEntry{})
	if result.Error != nil {
		return result.Error
	}
	return nil
}
