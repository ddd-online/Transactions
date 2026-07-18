package workspace

import (
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"

	"github.com/billadm/util"
)

func migrateKeyEventImages(db *gorm.DB, dir string) {
	type oldImage struct {
		ID        string
		EventDate string
		Data      string
		FilePath  string
		ThumbPath string
	}

	var rows []oldImage
	if err := db.Table("tbl_billadm_key_event_image").
		Where("file_path = '' OR file_path IS NULL").
		Where("data != '' AND data IS NOT NULL").
		Find(&rows).Error; err != nil {
		logrus.Warnf("查询待迁移图片失败: %v", err)
		return
	}

	if len(rows) == 0 {
		return
	}

	logrus.Infof("开始迁移 %d 张关键事件图片...", len(rows))
	success := 0
	failed := 0

	for _, row := range rows {
		filePath, thumbPath, err := util.SaveImage(dir, row.EventDate, row.ID, row.Data)
		if err != nil {
			logrus.Warnf("迁移图片失败 id=%s: %v", row.ID, err)
			failed++
			continue
		}

		if err := db.Table("tbl_billadm_key_event_image").
			Where("id = ?", row.ID).
			Updates(map[string]interface{}{
				"file_path":  filePath,
				"thumb_path": thumbPath,
			}).Error; err != nil {
			logrus.Warnf("更新图片路径失败 id=%s: %v", row.ID, err)
			failed++
			continue
		}

		success++
	}

	logrus.Infof("关键事件图片迁移完成: 成功 %d, 失败 %d", success, failed)
	if failed > 0 {
		logrus.Warnf("%d 张图片迁移失败，请检查日志", failed)
	}
}
