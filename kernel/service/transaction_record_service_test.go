package service_test

import (
	"testing"

	"github.com/billadm/constant"
	"github.com/billadm/dao"
	"github.com/billadm/models/dto"
	"github.com/billadm/service"
	"github.com/billadm/workspace"
)

func newTrService(t *testing.T) (service.TransactionRecordService, *workspace.Workspace) {
	t.Helper()
	ws, err := workspace.NewWorkspace(t.TempDir())
	if err != nil {
		t.Fatalf("创建工作空间失败: %v", err)
	}
	t.Cleanup(func() { ws.Close() })

	keyEventSvc := service.NewKeyEventService(
		service.NewKeyEventImageService(dao.NewKeyEventImageDao()),
		dao.NewKeyEventDao(),
	)
	trSvc := service.NewTrService(keyEventSvc, dao.NewTransactionRecordDao(), dao.NewTrTagDao())
	return trSvc, ws
}

func TestCreateAndBatchCreateTr(t *testing.T) {
	trSvc, ws := newTrService(t)
	const ledger = "ledger-svc"

	id, err := trSvc.CreateTr(ws, &dto.TransactionRecordDto{
		LedgerID:        ledger,
		Price:           100,
		TransactionType: constant.TransactionTypeExpense,
		Category:        "餐饮",
		Description:     "午饭",
		TransactionAt:   1780000000,
		Tags:            []string{"咖啡"},
	})
	if err != nil {
		t.Fatalf("创建单条失败: %v", err)
	}
	if id == "" {
		t.Fatal("创建单条未返回 ID")
	}

	dtos := make([]*dto.TransactionRecordDto, 0, 1200)
	for i := 0; i < 1200; i++ {
		dtos = append(dtos, &dto.TransactionRecordDto{
			LedgerID:        ledger,
			Price:           int64(i),
			TransactionType: constant.TransactionTypeExpense,
			Category:        "餐饮",
			TransactionAt:   1780000000 + int64(i),
			Tags:            []string{"咖啡", "外卖"},
		})
	}
	count, err := trSvc.BatchCreateTr(ws, dtos)
	if err != nil {
		t.Fatalf("批量创建失败: %v", err)
	}
	if count != 1200 {
		t.Fatalf("批量创建数量应为 1200, 实际 %d", count)
	}

	// 标签筛选（SQL 下推）应命中全部 1200 条新记录
	result, err := trSvc.QueryTrsOnCondition(ws, &dto.TrQueryCondition{
		LedgerID: ledger,
		Limit:    15,
		Items: []dto.QueryConditionItem{
			{TransactionType: constant.TransactionTypeExpense, Tags: []string{"外卖"}, TagPolicy: "all"},
		},
	})
	if err != nil {
		t.Fatalf("查询失败: %v", err)
	}
	if result.Total != 1200 {
		t.Fatalf("标签筛选应命中 1200 条, 实际 %d", result.Total)
	}
	if result.TotalPages != 80 || len(result.Items) != 15 {
		t.Fatalf("分页错误: totalPages=%d items=%d", result.TotalPages, len(result.Items))
	}
}

func TestQueryTrsOnConditionEmptyResultNoPanic(t *testing.T) {
	trSvc, ws := newTrService(t)

	// 空账本 + 未传 limit（Limit=0）：此前 pageSize=0 会触发整数除零 panic
	result, err := trSvc.QueryTrsOnCondition(ws, &dto.TrQueryCondition{
		LedgerID: "empty-ledger",
	})
	if err != nil {
		t.Fatalf("查询失败: %v", err)
	}
	if result.Total != 0 || len(result.Items) != 0 {
		t.Fatalf("空结果应为 total=0/items=0, 实际 total=%d items=%d", result.Total, len(result.Items))
	}
	if result.TotalPages != 0 {
		t.Fatalf("空结果 TotalPages 应为 0, 实际 %d", result.TotalPages)
	}
}

func TestQueryLinkedByDateIsLedgerScoped(t *testing.T) {
	trSvc, ws := newTrService(t)

	// 两个账本在同一日期各关联一条交易
	for _, ledger := range []string{"ledger-a", "ledger-b"} {
		id, err := trSvc.CreateTr(ws, &dto.TransactionRecordDto{
			LedgerID:        ledger,
			Price:           100,
			TransactionType: constant.TransactionTypeExpense,
			Category:        "餐饮",
			TransactionAt:   1780000000,
		})
		if err != nil {
			t.Fatalf("创建交易失败(%s): %v", ledger, err)
		}
		if err := trSvc.LinkToKeyEvent(ws, id, "2026-05-01"); err != nil {
			t.Fatalf("关联关键事件失败(%s): %v", ledger, err)
		}
	}

	// 账本 A 查询同一日期，只能拿到自己的 1 条
	dtos, err := trSvc.QueryLinkedByDate(ws, "ledger-a", "2026-05-01")
	if err != nil {
		t.Fatalf("查询关联交易失败: %v", err)
	}
	if len(dtos) != 1 {
		t.Fatalf("跨账本隔离失败: 期望 1 条, 实际 %d", len(dtos))
	}
	if dtos[0].LedgerID != "ledger-a" {
		t.Fatalf("返回了错误账本的交易: %s", dtos[0].LedgerID)
	}
}
