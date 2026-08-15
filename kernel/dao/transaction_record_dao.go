package dao

import (
	"fmt"
	"strings"

	"gorm.io/gorm"

	"github.com/transactions/constant"
	"github.com/transactions/models"
	"github.com/transactions/models/dto"
	"github.com/transactions/workspace"
)

// TrStatistics holds aggregate price sums by transaction type.
type TrStatistics struct {
	Income   int64
	Expense  int64
	Transfer int64
}

// TrFilterResult holds filtered, sorted, paginated results.
type TrFilterResult struct {
	Items      []*models.TransactionRecord
	Total      int64
	Statistics TrStatistics
}

type TransactionRecordDao interface {
	Create(ws *workspace.Workspace, record *models.TransactionRecord) error
	CreateBatch(ws *workspace.Workspace, records []*models.TransactionRecord) error
	QueryFiltered(ws *workspace.Workspace, condition *dto.TrQueryCondition) (*TrFilterResult, error)
	QueryById(ws *workspace.Workspace, trId string) (*models.TransactionRecord, error)
	DeleteById(ws *workspace.Workspace, trId string) error
	UpdateKeyEventDate(ws *workspace.Workspace, trId string, date string) error
	QueryByKeyEventDate(ws *workspace.Workspace, ledgerId string, date string) ([]*models.TransactionRecord, error)
	CountByLedgerId(ws *workspace.Workspace, ledgerId string) (int64, error)
	DeleteAllByLedgerId(ws *workspace.Workspace, ledgerId string) error
	QueryStatistics(ws *workspace.Workspace, ledgerId string, tsRange []int64) (TrStatistics, error)
	QueryChartLineData(ws *workspace.Workspace, ledgerId string, tsRange []int64, granularity string, line dto.ChartLineCondition) ([]dto.ChartPoint, error)
}

var _ TransactionRecordDao = &trDaoImpl{}

type trDaoImpl struct{}

func NewTransactionRecordDao() TransactionRecordDao {
	return &trDaoImpl{}
}

func (d *trDaoImpl) Create(ws *workspace.Workspace, record *models.TransactionRecord) error {
	return ws.GetDb().Create(record).Error
}

func (d *trDaoImpl) CreateBatch(ws *workspace.Workspace, records []*models.TransactionRecord) error {
	if len(records) == 0 {
		return nil
	}
	return ws.GetDb().CreateInBatches(records, 500).Error
}

func (d *trDaoImpl) QueryById(ws *workspace.Workspace, trId string) (*models.TransactionRecord, error) {
	var tr models.TransactionRecord
	if err := ws.GetDb().Where("transaction_id = ?", trId).First(&tr).Error; err != nil {
		return nil, err
	}
	return &tr, nil
}

func (d *trDaoImpl) DeleteById(ws *workspace.Workspace, trId string) error {
	return ws.GetDb().Where("transaction_id = ?", trId).Delete(&models.TransactionRecord{}).Error
}

func (d *trDaoImpl) UpdateKeyEventDate(ws *workspace.Workspace, trId string, date string) error {
	result := ws.GetDb().
		Model(&models.TransactionRecord{}).
		Where("transaction_id = ?", trId).
		Update("key_event_date", date)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (d *trDaoImpl) QueryByKeyEventDate(ws *workspace.Workspace, ledgerId string, date string) ([]*models.TransactionRecord, error) {
	trs := make([]*models.TransactionRecord, 0)
	err := ws.GetDb().
		Where("ledger_id = ? AND key_event_date = ?", ledgerId, date).
		Order("transaction_at desc").
		Find(&trs).Error
	return trs, err
}

func (d *trDaoImpl) CountByLedgerId(ws *workspace.Workspace, ledgerId string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.TransactionRecord{}).Where("ledger_id = ?", ledgerId).Count(&count).Error
	if err != nil {
		return -1, err
	}
	return count, nil
}

func (d *trDaoImpl) DeleteAllByLedgerId(ws *workspace.Workspace, ledgerId string) error {
	return ws.GetDb().Where("ledger_id = ?", ledgerId).Delete(&models.TransactionRecord{}).Error
}

// buildFilteredQuery 把查询条件下推到 SQL。
// 条件项之间是 OR 关系（与内存版 TrOperator 语义一致），item 内部字段是 AND；
// 标签条件通过 EXISTS / COUNT 子查询实现，无需再回内存过滤。
func buildFilteredQuery(db *gorm.DB, condition *dto.TrQueryCondition) *gorm.DB {
	db = db.Where("ledger_id = ?", condition.LedgerID)
	if len(condition.TsRange) == 2 {
		db = db.Where("transaction_at >= ?", condition.TsRange[0]).Where("transaction_at <= ?", condition.TsRange[1])
	}
	if clause, args := buildItemsClause(condition.Items); clause != "" {
		db = db.Where(clause, args...)
	}
	return db
}

// buildItemsClause 将 OR 语义的条件项列表转换为 SQL 片段（含占位符与参数）。
func buildItemsClause(items []dto.QueryConditionItem) (string, []any) {
	if len(items) == 0 {
		return "", nil
	}
	orClauses := make([]string, 0, len(items))
	orArgs := make([]any, 0)
	for _, item := range items {
		sub := make([]string, 0, 4)
		subArgs := make([]any, 0, 4)

		if item.TransactionType != "" {
			sub = append(sub, "transaction_type = ?")
			subArgs = append(subArgs, item.TransactionType)
		}
		if item.Category != "" {
			sub = append(sub, "category = ?")
			subArgs = append(subArgs, item.Category)
		}
		if item.Description != "" {
			// instr() 与 Go 的 strings.Contains 等价：区分大小写，且不把 % _ 当通配符
			sub = append(sub, "instr(description, ?) > 0")
			subArgs = append(subArgs, item.Description)
		}
		if len(item.Tags) > 0 {
			sub = append(sub, buildTagCondition(item.Tags, item.TagPolicy, item.TagNot))
			for _, tag := range item.Tags {
				subArgs = append(subArgs, tag)
			}
		}
		if len(sub) == 0 {
			// 空条件项在内存实现中匹配所有记录（OR 语义），保持等价
			orClauses = append(orClauses, "1 = 1")
			continue
		}
		orClauses = append(orClauses, "("+strings.Join(sub, " AND ")+")")
		orArgs = append(orArgs, subArgs...)
	}
	return strings.Join(orClauses, " OR "), orArgs
}

// buildTagCondition 生成标签匹配子查询。
// policy 为 "all" 时要求记录同时包含全部标签，否则按 "any"（包含任意一个）处理。
func buildTagCondition(tags []string, policy string, negate bool) string {
	trTable := (&models.TransactionRecord{}).TableName()
	tagTable := (&models.TrTag{}).TableName()
	placeholders := strings.TrimSuffix(strings.Repeat("?,", len(tags)), ",")

	var expr string
	if policy == constant.All {
		expr = fmt.Sprintf("(SELECT COUNT(DISTINCT t.tag) FROM %s t WHERE t.transaction_id = %s.transaction_id AND t.tag IN (%s)) = %d",
			tagTable, trTable, placeholders, len(tags))
	} else {
		expr = fmt.Sprintf("EXISTS (SELECT 1 FROM %s t WHERE t.transaction_id = %s.transaction_id AND t.tag IN (%s))",
			tagTable, trTable, placeholders)
	}
	if negate {
		return "NOT " + expr
	}
	return expr
}

func buildSortClause(sortFields []dto.QueryConditionSortField) string {
	if len(sortFields) == 0 {
		return "transaction_at desc"
	}
	fieldMap := map[string]string{
		"transactionAt": "transaction_at",
		"transactionType": "transaction_type",
		"price":            "price",
		"category":         "category",
	}
	clauses := make([]string, 0, len(sortFields))
	for _, sf := range sortFields {
		order := "desc"
		if sf.Order == "asc" {
			order = "asc"
		}
		if col, ok := fieldMap[sf.Field]; ok {
			clauses = append(clauses, col+" "+order)
		}
	}
	if len(clauses) == 0 {
		return "transaction_at desc"
	}
	return strings.Join(clauses, ", ")
}

func (d *trDaoImpl) QueryFiltered(ws *workspace.Workspace, condition *dto.TrQueryCondition) (*TrFilterResult, error) {
	db := ws.GetDb().Model(&models.TransactionRecord{})
	db = buildFilteredQuery(db, condition)

	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, err
	}

	sortClause := buildSortClause(condition.SortFields)
	db = db.Order(sortClause)

	if condition.Offset > 0 {
		db = db.Offset(condition.Offset)
	}
	if condition.Limit > 0 {
		db = db.Limit(condition.Limit)
	}

	trs := make([]*models.TransactionRecord, 0)
	if err := db.Find(&trs).Error; err != nil {
		return nil, err
	}

	stats, err := d.QueryStatistics(ws, condition.LedgerID, condition.TsRange)
	if err != nil {
		return nil, err
	}

	return &TrFilterResult{Items: trs, Total: total, Statistics: stats}, nil
}

// QueryStatistics 按交易类型汇总指定账本与时间范围内的金额。
// 统计口径固定为"账本 + 时间范围"（不随筛选条件变化），底部统计条展示的是范围总额。
func (d *trDaoImpl) QueryStatistics(ws *workspace.Workspace, ledgerId string, tsRange []int64) (TrStatistics, error) {
	var stats TrStatistics
	db := ws.GetDb().Model(&models.TransactionRecord{}).Where("ledger_id = ?", ledgerId)
	if len(tsRange) == 2 {
		db = db.Where("transaction_at >= ?", tsRange[0]).Where("transaction_at <= ?", tsRange[1])
	}
	type statRow struct {
		TransactionType string
		Total           int64
	}
	var rows []statRow
	if err := db.Select("transaction_type, SUM(price) as total").Group("transaction_type").Scan(&rows).Error; err != nil {
		return stats, err
	}
	for _, r := range rows {
		switch r.TransactionType {
		case constant.TransactionTypeIncome:
			stats.Income = r.Total
		case constant.TransactionTypeExpense:
			stats.Expense = r.Total
		case constant.TransactionTypeTransfer:
			stats.Transfer = r.Total
		}
	}
	return stats, nil
}

// QueryChartLineData 在 SQL 中完成按时间桶的金额聚合，只返回序列点，
// 不再把全量明细序列化给前端。
func (d *trDaoImpl) QueryChartLineData(ws *workspace.Workspace, ledgerId string, tsRange []int64, granularity string, line dto.ChartLineCondition) ([]dto.ChartPoint, error) {
	db := ws.GetDb().Model(&models.TransactionRecord{})
	db = db.Where("ledger_id = ?", ledgerId)
	if len(tsRange) == 2 {
		db = db.Where("transaction_at >= ?", tsRange[0]).Where("transaction_at <= ?", tsRange[1])
	}
	db = db.Where("transaction_type = ?", line.TransactionType)
	if !line.IncludeOutlier {
		// Flags 存的是 JSON（{"outlier":true}）；json_extract 缺失或非法时返回 NULL，行保留
		db = db.Where("json_extract(flags, '$.outlier') IS NOT 1")
	}
	if clause, args := buildItemsClause(line.Conditions); clause != "" {
		db = db.Where(clause, args...)
	}

	timeFmt := "%Y-%m"
	if granularity == "year" {
		timeFmt = "%Y"
	}
	points := make([]dto.ChartPoint, 0)
	// transaction_at 为 unix 秒
	if err := db.Select(fmt.Sprintf("strftime('%s', transaction_at, 'unixepoch') AS time, SUM(price) AS amount", timeFmt)).
		Group("time").
		Scan(&points).Error; err != nil {
		return nil, err
	}
	return points, nil
}
