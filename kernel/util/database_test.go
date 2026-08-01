package util

import (
	"path/filepath"
	"testing"
)

type pragmaIndexRow struct {
	Seq     int
	Name    string
	Unique  int
	Origin  string
	Partial int
}

func TestNewDbInstancePragmasAndIndexes(t *testing.T) {
	db, err := NewDbInstance(filepath.Join(t.TempDir(), "app.db"))
	if err != nil {
		t.Fatalf("打开数据库失败: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Fatalf("获取 sql.DB 失败: %v", err)
	}
	defer func() { _ = sqlDB.Close() }()

	// 1. WAL 模式已生效
	var journalMode string
	if err := db.Raw("PRAGMA journal_mode").Scan(&journalMode).Error; err != nil {
		t.Fatalf("查询 journal_mode 失败: %v", err)
	}
	if journalMode != "wal" {
		t.Fatalf("journal_mode 应为 wal, 实际 %s", journalMode)
	}

	// 2. 交易表复合索引与关键事件索引已创建
	var trIndexes []pragmaIndexRow
	if err := db.Raw("PRAGMA index_list('tbl_billadm_transaction_record')").Scan(&trIndexes).Error; err != nil {
		t.Fatalf("查询交易表索引失败: %v", err)
	}
	assertIndex(t, trIndexes, "idx_tr_ledger_at")
	assertIndex(t, trIndexes, "idx_tr_key_event_date")

	// 3. 标签关联表索引已创建
	var tagIndexes []pragmaIndexRow
	if err := db.Raw("PRAGMA index_list('tbl_billadm_transaction_record_tag')").Scan(&tagIndexes).Error; err != nil {
		t.Fatalf("查询标签表索引失败: %v", err)
	}
	assertIndex(t, tagIndexes, "idx_tr_tag_transaction")
	assertIndex(t, tagIndexes, "idx_tr_tag_ledger")

	// 4. 迁移记录表已初始化
	if !db.Migrator().HasTable(&SchemaMigration{}) {
		t.Fatal("schema_migrations 表未创建")
	}
}

func assertIndex(t *testing.T, rows []pragmaIndexRow, name string) {
	t.Helper()
	for _, r := range rows {
		if r.Name == name {
			return
		}
	}
	t.Fatalf("缺少索引 %s, 现有: %+v", name, rows)
}
