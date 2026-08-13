package util

import (
	"fmt"

	"gorm.io/gorm"
)

// Migration 表示一个版本化数据库迁移。
// ID 必须全局唯一且一旦发布就不可修改；SQL 只在 AutoMigrate 无法表达时使用，
// 例如：改列名、删列、数据回填、复杂索引调整。
type Migration struct {
	ID  string
	SQL string
}

// SchemaMigration 记录已经应用的迁移。
type SchemaMigration struct {
	ID        string `gorm:"column:id;primaryKey;comment:迁移ID"`
	AppliedAt int64  `gorm:"column:applied_at;autoCreateTime:unix;comment:应用时间"`
}

func (SchemaMigration) TableName() string {
	return "tbl_billadm_schema_migration"
}

// Migrate 按顺序执行所有未应用的迁移；每个迁移在独立事务中执行，
// 执行成功后立即登记，因此重复打开工作空间是幂等的。
func Migrate(db *gorm.DB, migrations []Migration) error {
	if err := db.AutoMigrate(&SchemaMigration{}); err != nil {
		return fmt.Errorf("初始化迁移记录表失败: %w", err)
	}

	applied := make(map[string]bool)
	var rows []SchemaMigration
	if err := db.Find(&rows).Error; err != nil {
		return fmt.Errorf("读取已应用迁移失败: %w", err)
	}
	for _, r := range rows {
		applied[r.ID] = true
	}

	for _, m := range migrations {
		if applied[m.ID] {
			continue
		}
		if m.ID == "" || m.SQL == "" {
			return fmt.Errorf("非法迁移: ID 与 SQL 均不能为空")
		}
		err := db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Exec(m.SQL).Error; err != nil {
				return err
			}
			return tx.Create(&SchemaMigration{ID: m.ID}).Error
		})
		if err != nil {
			return fmt.Errorf("应用迁移 %q 失败: %w", m.ID, err)
		}
	}
	return nil
}

// Migrations 返回项目当前的迁移列表。
// 新增迁移只允许在末尾追加，禁止修改或删除已发布条目。
func Migrations() []Migration {
	return []Migration{
		{
			// KeyEvent.date 原为全局唯一索引（gorm:"uniqueIndex" 自动命名为
			// idx_tbl_billadm_key_event_date），导致不同账本无法在同一天建关键事件。
			// 现已改为 (ledger_id, date) 复合唯一索引，需删除旧的全局唯一索引。
			// 使用 IF EXISTS 保证对全新数据库（无旧索引）幂等。
			ID:  "20260101_key_event_ledger_date_composite_unique",
			SQL: "DROP INDEX IF EXISTS idx_tbl_billadm_key_event_date",
		},
		{
			// KeyEventImage 补充账本维度（ledger_id）：为历史图片回填所属账本。
			// 历史数据里 date 全局唯一，event_date 能唯一定位到一条 key_event，
			// 因此用相关子查询回填；找不到对应事件的孤儿图片回填为空串。
			ID: "20260101_key_event_image_backfill_ledger_id",
			SQL: `UPDATE tbl_billadm_key_event_image
SET ledger_id = COALESCE((
    SELECT ledger_id FROM tbl_billadm_key_event
    WHERE tbl_billadm_key_event.date = tbl_billadm_key_event_image.event_date
    LIMIT 1
), '')`,
		},
	}
}
