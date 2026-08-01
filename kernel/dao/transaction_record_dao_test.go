package dao

import (
	"testing"
	"time"

	"github.com/billadm/constant"
	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/workspace"
)

func newTestWorkspace(t *testing.T) *workspace.Workspace {
	t.Helper()
	ws, err := workspace.NewWorkspace(t.TempDir())
	if err != nil {
		t.Fatalf("创建工作空间失败: %v", err)
	}
	t.Cleanup(func() { ws.Close() })
	return ws
}

func ts(y int, m time.Month, d int) int64 {
	return time.Date(y, m, d, 12, 0, 0, 0, time.Local).Unix()
}

func seedTr(t *testing.T, ws *workspace.Workspace, id, ledgerID string, price int64, trType, category, description string, at int64, tags []string) {
	t.Helper()
	rec := &models.TransactionRecord{
		TransactionID:   id,
		LedgerID:        ledgerID,
		Price:           price,
		TransactionType: trType,
		Category:        category,
		Description:     description,
		Flags:           `{"outlier":false}`,
		TransactionAt:   at,
	}
	if err := NewTransactionRecordDao().Create(ws, rec); err != nil {
		t.Fatalf("创建交易记录失败: %v", err)
	}
	if len(tags) == 0 {
		return
	}
	trTags := make([]*models.TrTag, 0, len(tags))
	for _, tag := range tags {
		trTags = append(trTags, &models.TrTag{LedgerID: ledgerID, TransactionID: id, Tag: tag})
	}
	if err := NewTrTagDao().CreateBatch(ws, trTags); err != nil {
		t.Fatalf("创建标签关联失败: %v", err)
	}
}

func TestQueryFilteredTagAnyAllNot(t *testing.T) {
	ws := newTestWorkspace(t)
	const ledger = "ledger-tag"

	seedTr(t, ws, "t1", ledger, 100, constant.TransactionTypeExpense, "餐饮", "", ts(2026, 1, 15), []string{"咖啡", "早餐"})
	seedTr(t, ws, "t2", ledger, 200, constant.TransactionTypeExpense, "交通", "", ts(2026, 1, 16), []string{"地铁"})
	seedTr(t, ws, "t3", ledger, 300, constant.TransactionTypeExpense, "餐饮", "", ts(2026, 2, 1), []string{"咖啡"})

	dao := NewTransactionRecordDao()

	t.Run("any", func(t *testing.T) {
		res, err := dao.QueryFiltered(ws, &dto.TrQueryCondition{
			LedgerID: ledger,
			Items: []dto.QueryConditionItem{
				{TransactionType: constant.TransactionTypeExpense, Tags: []string{"咖啡"}, TagPolicy: "any"},
			},
		})
		if err != nil {
			t.Fatalf("查询失败: %v", err)
		}
		if res.Total != 2 {
			t.Fatalf("any 匹配应为 2 条, 实际 %d", res.Total)
		}
	})

	t.Run("all", func(t *testing.T) {
		res, err := dao.QueryFiltered(ws, &dto.TrQueryCondition{
			LedgerID: ledger,
			Items: []dto.QueryConditionItem{
				{TransactionType: constant.TransactionTypeExpense, Tags: []string{"咖啡", "早餐"}, TagPolicy: "all"},
			},
		})
		if err != nil {
			t.Fatalf("查询失败: %v", err)
		}
		if res.Total != 1 || res.Items[0].TransactionID != "t1" {
			t.Fatalf("all 匹配应只有 t1, 实际 total=%d", res.Total)
		}
	})

	t.Run("not_any", func(t *testing.T) {
		res, err := dao.QueryFiltered(ws, &dto.TrQueryCondition{
			LedgerID: ledger,
			Items: []dto.QueryConditionItem{
				{TransactionType: constant.TransactionTypeExpense, Tags: []string{"咖啡"}, TagPolicy: "any", TagNot: true},
			},
		})
		if err != nil {
			t.Fatalf("查询失败: %v", err)
		}
		if res.Total != 1 || res.Items[0].TransactionID != "t2" {
			t.Fatalf("not_any 匹配应只有 t2, 实际 total=%d", res.Total)
		}
	})
}

func TestQueryFilteredORMultipleItems(t *testing.T) {
	ws := newTestWorkspace(t)
	const ledger = "ledger-or"

	seedTr(t, ws, "a", ledger, 100, constant.TransactionTypeExpense, "餐饮", "", ts(2026, 1, 15), nil)
	seedTr(t, ws, "b", ledger, 200, constant.TransactionTypeIncome, "工资", "", ts(2026, 1, 16), nil)
	seedTr(t, ws, "c", ledger, 300, constant.TransactionTypeExpense, "交通", "", ts(2026, 1, 17), nil)

	res, err := NewTransactionRecordDao().QueryFiltered(ws, &dto.TrQueryCondition{
		LedgerID: ledger,
		Items: []dto.QueryConditionItem{
			{TransactionType: constant.TransactionTypeExpense, Category: "餐饮"},
			{TransactionType: constant.TransactionTypeIncome, Category: "工资"},
		},
	})
	if err != nil {
		t.Fatalf("查询失败: %v", err)
	}
	// OR 语义：餐饮支出 + 工资收入，交通支出不应命中
	if res.Total != 2 {
		t.Fatalf("OR 匹配应为 2 条, 实际 %d", res.Total)
	}
	for _, item := range res.Items {
		if item.TransactionID == "c" {
			t.Fatal("交通支出不应命中 OR 条件")
		}
	}
}

func TestQueryStatistics(t *testing.T) {
	ws := newTestWorkspace(t)
	const ledger = "ledger-stat"

	seedTr(t, ws, "s1", ledger, 100, constant.TransactionTypeExpense, "餐饮", "", ts(2026, 1, 15), nil)
	seedTr(t, ws, "s2", ledger, 500, constant.TransactionTypeIncome, "工资", "", ts(2026, 1, 20), nil)
	seedTr(t, ws, "s3", ledger, 50, constant.TransactionTypeTransfer, "五险", "", ts(2026, 1, 21), nil)
	seedTr(t, ws, "s4", ledger, 999, constant.TransactionTypeExpense, "餐饮", "", ts(2026, 3, 1), nil)

	stats, err := NewTransactionRecordDao().QueryStatistics(ws, ledger, []int64{ts(2026, 1, 1), ts(2026, 1, 31)})
	if err != nil {
		t.Fatalf("统计失败: %v", err)
	}
	if stats.Income != 500 || stats.Expense != 100 || stats.Transfer != 50 {
		t.Fatalf("统计错误: %+v", stats)
	}
}

func TestQueryChartLineData(t *testing.T) {
	ws := newTestWorkspace(t)
	const ledger = "ledger-chart"

	seedTr(t, ws, "c1", ledger, 100, constant.TransactionTypeExpense, "餐饮", "", ts(2026, 1, 15), nil)
	seedTr(t, ws, "c2", ledger, 200, constant.TransactionTypeExpense, "餐饮", "", ts(2026, 1, 20), nil)
	seedTr(t, ws, "c3", ledger, 500, constant.TransactionTypeIncome, "工资", "", ts(2026, 1, 21), nil)
	seedTr(t, ws, "c4", ledger, 300, constant.TransactionTypeExpense, "交通", "", ts(2026, 2, 5), nil)

	dao := NewTransactionRecordDao()

	points, err := dao.QueryChartLineData(ws, ledger, nil, "month", dto.ChartLineCondition{
		Label:           "支出",
		TransactionType: constant.TransactionTypeExpense,
		IncludeOutlier:  false,
	})
	if err != nil {
		t.Fatalf("聚合查询失败: %v", err)
	}
	if len(points) != 2 {
		t.Fatalf("应有 2 个月份桶, 实际 %d: %+v", len(points), points)
	}
	byMonth := map[string]int64{}
	for _, p := range points {
		byMonth[p.Time] = p.Amount
	}
	if byMonth["2026-01"] != 300 || byMonth["2026-02"] != 300 {
		t.Fatalf("月份聚合金额错误: %+v", byMonth)
	}

	// 离群值排除：把 c2 标记为离群后，2026-01 应只剩 100
	ws.GetDb().Model(&models.TransactionRecord{}).
		Where("transaction_id = ?", "c2").
		Update("flags", `{"outlier":true}`)
	points, err = dao.QueryChartLineData(ws, ledger, nil, "month", dto.ChartLineCondition{
		Label:           "支出",
		TransactionType: constant.TransactionTypeExpense,
		IncludeOutlier:  false,
	})
	if err != nil {
		t.Fatalf("聚合查询失败: %v", err)
	}
	for _, p := range points {
		if p.Time == "2026-01" && p.Amount != 100 {
			t.Fatalf("离群值未被排除: %+v", points)
		}
	}
}
