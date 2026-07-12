package service

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"time"
	"unicode/utf8"

	"github.com/billadm/models"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm/clause"
)

// FileItem 表示一个待导入的日记文件
type FileItem struct {
	Date string `json:"date"` // YYYY-MM-DD
	Path string `json:"path"` // 文件绝对路径
}

func NewDiaryService() DiaryService {
	return &diaryServiceImpl{}
}

type DiaryService interface {
	ListDates(ws *workspace.Workspace) ([]models.DiaryDateItem, error)
	GetByDate(ws *workspace.Workspace, date string) (*models.DiaryEntry, error)
	Upsert(ws *workspace.Workspace, date string, content string, mood string) (*models.DiaryEntry, error)
	DeleteByDate(ws *workspace.Workspace, date string) error
	// Import 导入
	ScanDirectory(dir string) ([]FileItem, error)
	ImportFile(ws *workspace.Workspace, path string, date string) (*models.DiaryEntry, error)
}

var _ DiaryService = &diaryServiceImpl{}

type diaryServiceImpl struct{}

func (s *diaryServiceImpl) ListDates(ws *workspace.Workspace) ([]models.DiaryDateItem, error) {
	var entries []models.DiaryEntry
	err := ws.GetDb().Model(&models.DiaryEntry{}).
		Select("date, word_count, mood").
		Order("date DESC").
		Find(&entries).Error
	if err != nil {
		return nil, err
	}
	items := make([]models.DiaryDateItem, len(entries))
	for i, e := range entries {
		items[i] = models.DiaryDateItem{
			Date:      e.Date,
			WordCount: e.WordCount,
			Mood:      e.Mood,
		}
	}
	return items, nil
}

func (s *diaryServiceImpl) GetByDate(ws *workspace.Workspace, date string) (*models.DiaryEntry, error) {
	var entry models.DiaryEntry
	err := ws.GetDb().Where("date = ?", date).First(&entry).Error
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

func (s *diaryServiceImpl) Upsert(ws *workspace.Workspace, date string, content string, mood string) (*models.DiaryEntry, error) {
	entry := models.DiaryEntry{
		ID:        util.GetUUID(),
		Date:      date,
		Content:   content,
		WordCount: utf8.RuneCountInString(content),
		Mood:      mood,
	}
	err := ws.GetDb().Clauses(clause.OnConflict{
		Columns:   []clause.Column{{Name: "date"}},
		DoUpdates: clause.AssignmentColumns([]string{"content", "word_count", "mood"}),
	}).Create(&entry).Error
	if err != nil {
		return nil, err
	}
	return &entry, nil
}

func (s *diaryServiceImpl) DeleteByDate(ws *workspace.Workspace, date string) error {
	logrus.Infof("删除日记, 日期: %s", date)
	result := ws.GetDb().Where("date = ?", date).Delete(&models.DiaryEntry{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return fmt.Errorf("日记不存在: %s", date)
	}
	return nil
}

// fileNameRe 匹配 YYYY-MM-DD.txt 文件名
var fileNameRe = regexp.MustCompile(`^(\d{4}-\d{2}-\d{2})\.txt$`)

func (s *diaryServiceImpl) ScanDirectory(dir string) ([]FileItem, error) {
	var files []FileItem

	err := filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		name := d.Name()
		matches := fileNameRe.FindStringSubmatch(name)
		if len(matches) != 2 {
			return nil
		}
		dateStr := matches[1]
		// 校验日期合法性（排除 2026-13-01 这类非法日期）
		if _, parseErr := time.Parse("2006-01-02", dateStr); parseErr != nil {
			return nil
		}
		files = append(files, FileItem{Date: dateStr, Path: path})
		return nil
	})
	if err != nil {
		return nil, fmt.Errorf("扫描目录失败: %w", err)
	}

	// 按日期升序（旧→新），导入顺序自然
	sort.Slice(files, func(i, j int) bool {
		return files[i].Date < files[j].Date
	})

	return files, nil
}

func (s *diaryServiceImpl) ImportFile(ws *workspace.Workspace, path string, date string) (*models.DiaryEntry, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取文件失败 %s: %w", path, err)
	}
	return s.Upsert(ws, date, string(content), "")
}
