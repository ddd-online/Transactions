package util

import (
	"path/filepath"
	"testing"

	"github.com/glebarez/sqlite"
	"gorm.io/gorm"
)

func newMigrateTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(filepath.Join(t.TempDir(), "migrate_test.db")), &gorm.Config{})
	if err != nil {
		t.Fatalf("打开测试数据库失败: %v", err)
	}
	t.Cleanup(func() {
		sqlDB, _ := db.DB()
		_ = sqlDB.Close()
	})
	return db
}

func TestMigrateAppliesOnceAndIsIdempotent(t *testing.T) {
	db := newMigrateTestDB(t)

	migrations := []Migration{
		{ID: "20260801001", SQL: "CREATE TABLE t_migration_a (id INTEGER PRIMARY KEY, name TEXT)"},
	}
	if err := Migrate(db, migrations); err != nil {
		t.Fatalf("首次迁移失败: %v", err)
	}

	// 重复执行应幂等
	if err := Migrate(db, migrations); err != nil {
		t.Fatalf("重复迁移失败: %v", err)
	}

	var count int64
	if err := db.Table("tbl_billadm_schema_migration").Count(&count).Error; err != nil {
		t.Fatalf("统计迁移记录失败: %v", err)
	}
	if count != 1 {
		t.Fatalf("迁移记录数应为 1, 实际 %d", count)
	}
}

func TestMigrateAppendsNewMigration(t *testing.T) {
	db := newMigrateTestDB(t)

	if err := Migrate(db, []Migration{{ID: "v1", SQL: "CREATE TABLE t_one (id INTEGER)"}}); err != nil {
		t.Fatalf("v1 迁移失败: %v", err)
	}
	if err := Migrate(db, []Migration{
		{ID: "v1", SQL: "CREATE TABLE t_one (id INTEGER)"},
		{ID: "v2", SQL: "CREATE TABLE t_two (id INTEGER)"},
	}); err != nil {
		t.Fatalf("追加 v2 迁移失败: %v", err)
	}

	var count int64
	if err := db.Table("tbl_billadm_schema_migration").Count(&count).Error; err != nil {
		t.Fatalf("统计迁移记录失败: %v", err)
	}
	if count != 2 {
		t.Fatalf("迁移记录数应为 2, 实际 %d", count)
	}
}

func TestMigrateRejectsInvalidMigration(t *testing.T) {
	db := newMigrateTestDB(t)
	if err := Migrate(db, []Migration{{ID: "", SQL: "SELECT 1"}}); err == nil {
		t.Fatal("空 ID 的迁移应当报错")
	}
	if err := Migrate(db, []Migration{{ID: "x", SQL: ""}}); err == nil {
		t.Fatal("空 SQL 的迁移应当报错")
	}
}
