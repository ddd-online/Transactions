package dao

import (
	"strings"

	"gorm.io/gorm"

	"github.com/billadm/constant"
	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/util/set"
	"github.com/billadm/workspace"
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
	QueryByCondition(ws *workspace.Workspace, condition *dto.TrQueryCondition) ([]*models.TransactionRecord, error)
	QueryFiltered(ws *workspace.Workspace, condition *dto.TrQueryCondition) (*TrFilterResult, error)
	QueryById(ws *workspace.Workspace, trId string) (*models.TransactionRecord, error)
	DeleteById(ws *workspace.Workspace, trId string) error
	UpdateKeyEventDate(ws *workspace.Workspace, trId string, date string) error
	QueryByKeyEventDate(ws *workspace.Workspace, date string) ([]*models.TransactionRecord, error)
	CountByLedgerId(ws *workspace.Workspace, ledgerId string) (int64, error)
	DeleteAllByLedgerId(ws *workspace.Workspace, ledgerId string) error
	ListAllByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*models.TransactionRecord, error)
}

var _ TransactionRecordDao = &trDaoImpl{}

type trDaoImpl struct{}

func NewTransactionRecordDao() TransactionRecordDao {
	return &trDaoImpl{}
}

func (d *trDaoImpl) Create(ws *workspace.Workspace, record *models.TransactionRecord) error {
	return ws.GetDb().Create(record).Error
}

func (d *trDaoImpl) QueryByCondition(ws *workspace.Workspace, condition *dto.TrQueryCondition) ([]*models.TransactionRecord, error) {
	trs := make([]*models.TransactionRecord, 0)
	db := ws.GetDb().Where("ledger_id = ?", condition.LedgerID)
	db = db.Order("transaction_at desc, transaction_type asc, category desc, price desc")
	if len(condition.TsRange) == 2 {
		db = db.Where("transaction_at >= ?", condition.TsRange[0]).Where("transaction_at <= ?", condition.TsRange[1])
	}
	ttSet := set.New[string]()
	for _, item := range condition.Items {
		ttSet.Add(item.TransactionType)
	}
	if ttSet.Size() > 0 {
		db = db.Where("transaction_type IN (?)", ttSet.Values())
	}
	db = db.Find(&trs)
	if err := db.Error; err != nil {
		return nil, err
	}
	return trs, nil
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

func (d *trDaoImpl) QueryByKeyEventDate(ws *workspace.Workspace, date string) ([]*models.TransactionRecord, error) {
	trs := make([]*models.TransactionRecord, 0)
	err := ws.GetDb().
		Where("key_event_date = ?", date).
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

func (d *trDaoImpl) ListAllByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*models.TransactionRecord, error) {
	trs := make([]*models.TransactionRecord, 0)
	if err := ws.GetDb().
		Where("ledger_id = ?", ledgerId).
		Order("transaction_at desc, category desc").
		Find(&trs).Error; err != nil {
		return nil, err
	}
	return trs, nil
}

// buildFilteredQuery applies filter conditions to a GORM query for transaction records.
// It pushes category, description, and transaction type filters to SQL.
// Tag filtering remains in-memory (too complex for SQLite subqueries with any/all/NOT policies).
func buildFilteredQuery(db *gorm.DB, condition *dto.TrQueryCondition) *gorm.DB {
	db = db.Where("ledger_id = ?", condition.LedgerID)
	if len(condition.TsRange) == 2 {
		db = db.Where("transaction_at >= ?", condition.TsRange[0]).Where("transaction_at <= ?", condition.TsRange[1])
	}
	ttSet := set.New[string]()
	for _, item := range condition.Items {
		ttSet.Add(item.TransactionType)
		if item.Category != "" {
			db = db.Where("category = ?", item.Category)
		}
		if item.Description != "" {
			db = db.Where("description LIKE ?", "%"+item.Description+"%")
		}
	}
	if ttSet.Size() > 0 {
		db = db.Where("transaction_type IN (?)", ttSet.Values())
	}
	return db
}

func buildSortClause(sortFields []dto.QueryConditionSortField) string {
	if len(sortFields) == 0 {
		return "transaction_at desc"
	}
	clauses := make([]string, 0, len(sortFields))
	for _, sf := range sortFields {
		order := "desc"
		if sf.Order == "asc" {
			order = "asc"
		}
		switch sf.Field {
		case "price", "transactionType", "category", "transactionAt":
			clauses = append(clauses, sf.Field+" "+order)
		default:
			clauses = append(clauses, sf.Field+" "+order)
		}
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

	stats := TrStatistics{}
	statDb := ws.GetDb().Model(&models.TransactionRecord{}).Where("ledger_id = ?", condition.LedgerID)
	if len(condition.TsRange) == 2 {
		statDb = statDb.Where("transaction_at >= ?", condition.TsRange[0]).Where("transaction_at <= ?", condition.TsRange[1])
	}
	type row struct {
		TransactionType string
		Total           int64
	}
	var rows []row
	if err := statDb.Select("transaction_type, SUM(price) as total").Group("transaction_type").Scan(&rows).Error; err != nil {
		return nil, err
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

	return &TrFilterResult{Items: trs, Total: total, Statistics: stats}, nil
}
