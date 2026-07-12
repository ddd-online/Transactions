package service

import (
	"bytes"
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
	"golang.org/x/text/encoding/simplifiedchinese"
	"golang.org/x/text/encoding/unicode"
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

// gbkDecoder 复用，避免每次 toUTF8 调用时重新分配
var gbkDecoder = simplifiedchinese.GBK.NewDecoder()

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
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("读取文件失败 %s: %w", path, err)
	}
	content := toUTF8(raw)
	return s.Upsert(ws, date, content, "")
}

// toUTF8 将字节内容转为 UTF-8 字符串。
// 依次尝试：UTF-8 → UTF-16 BOM → GBK → 替换非法字节。
func toUTF8(raw []byte) string {
	if utf8.Valid(raw) {
		return string(raw)
	}
	if decoded := decodeUTF16(raw); decoded != "" {
		return decoded
	}
	decoded, err := gbkDecoder.Bytes(raw)
	if err == nil {
		return string(decoded)
	}
	// 回退：替换非法 UTF-8 字节为 ?
	return string(bytes.ToValidUTF8(raw, []byte("?")))
}

// decodeUTF16 尝试将 UTF-16 LE/BE（带 BOM）解码为 UTF-8。
func decodeUTF16(raw []byte) string {
	if len(raw) < 2 {
		return ""
	}
	// 根据 BOM 选择编码并跳过 BOM 字节
	var decoded []byte
	var err error
	switch {
	case raw[0] == 0xFF && raw[1] == 0xFE:
		decoded, err = unicode.UTF16(unicode.LittleEndian, unicode.IgnoreBOM).NewDecoder().Bytes(raw[2:])
	case raw[0] == 0xFE && raw[1] == 0xFF:
		decoded, err = unicode.UTF16(unicode.BigEndian, unicode.IgnoreBOM).NewDecoder().Bytes(raw[2:])
	default:
		return ""
	}
	if err != nil {
		return ""
	}
	return string(decoded)
}
