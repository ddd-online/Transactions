package service

import (
	"errors"
	"fmt"

	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/pkg/operator"
	"github.com/billadm/util"
	"github.com/billadm/util/set"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

func NewTrService(keyEventSvc KeyEventService) TransactionRecordService {
	return &transactionRecordServiceImpl{
		keyEventSvc: keyEventSvc,
	}
}

type TransactionRecordService interface {
	CreateTr(ws *workspace.Workspace, dto *dto.TransactionRecordDto) (string, error)
	BatchCreateTr(ws *workspace.Workspace, dtos []*dto.TransactionRecordDto) (int, error)
	QueryTrsOnCondition(ws *workspace.Workspace, condition *dto.TrQueryCondition) (*dto.TrQueryResult, error)
	QueryTrsForChart(ws *workspace.Workspace, req *dto.ChartQueryRequest) (*dto.ChartQueryResponse, error)
	DeleteTrById(ws *workspace.Workspace, trId string) error
	LinkToKeyEvent(ws *workspace.Workspace, trId string, date string) error
	UnlinkFromKeyEvent(ws *workspace.Workspace, trId string) error
	QueryLinkedByDate(ws *workspace.Workspace, date string) ([]*dto.TransactionRecordDto, error)
}

var _ TransactionRecordService = &transactionRecordServiceImpl{}

type transactionRecordServiceImpl struct {
	keyEventSvc KeyEventService
}

// ---- internal GORM helpers (merged from dao package) ----

// createTrRecord inserts a single transaction record.
func createTrRecord(ws *workspace.Workspace, record *models.TransactionRecord) error {
	return ws.GetDb().Create(record).Error
}

// queryTrsOnConditionRaw queries transaction records with basic filters (ledger, time range, type).
func queryTrsOnConditionRaw(ws *workspace.Workspace, condition *dto.TrQueryCondition) ([]*models.TransactionRecord, error) {
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

// queryTrById queries a single transaction by ID.
func queryTrById(ws *workspace.Workspace, trId string) (*models.TransactionRecord, error) {
	var tr models.TransactionRecord
	if err := ws.GetDb().Where("transaction_id = ?", trId).First(&tr).Error; err != nil {
		return nil, err
	}
	return &tr, nil
}

// deleteTrById deletes a single transaction record by ID.
func deleteTrById(ws *workspace.Workspace, trId string) error {
	return ws.GetDb().Where("transaction_id = ?", trId).Delete(&models.TransactionRecord{}).Error
}

// updateKeyEventDate updates the key_event_date column for a transaction.
func updateKeyEventDate(ws *workspace.Workspace, trId string, date string) error {
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

// queryByKeyEventDate queries transactions linked to a specific key event date.
func queryByKeyEventDate(ws *workspace.Workspace, date string) ([]*models.TransactionRecord, error) {
	trs := make([]*models.TransactionRecord, 0)
	err := ws.GetDb().
		Where("key_event_date = ?", date).
		Order("transaction_at desc").
		Find(&trs).Error
	return trs, err
}

// countTrByLedgerId counts transactions for a ledger.
func countTrByLedgerId(ws *workspace.Workspace, ledgerId string) (int64, error) {
	var count int64
	err := ws.GetDb().Model(&models.TransactionRecord{}).Where("ledger_id = ?", ledgerId).Count(&count).Error
	if err != nil {
		return -1, err
	}
	return count, nil
}

// deleteAllTrByLedgerId deletes all transactions for a ledger.
func deleteAllTrByLedgerId(ws *workspace.Workspace, ledgerId string) error {
	return ws.GetDb().Where("ledger_id = ?", ledgerId).Delete(&models.TransactionRecord{}).Error
}

// listAllTrByLedgerId lists all transactions for a ledger.
func listAllTrByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*models.TransactionRecord, error) {
	trs := make([]*models.TransactionRecord, 0)
	if err := ws.GetDb().
		Where("ledger_id = ?", ledgerId).
		Order("transaction_at desc, category desc").
		Find(&trs).Error; err != nil {
		return nil, err
	}
	return trs, nil
}

// ---- TrTag helpers (merged from dao package) ----

// createTrTags inserts multiple TrTag records.
func createTrTags(ws *workspace.Workspace, tags []*models.TrTag) error {
	if len(tags) <= 0 {
		return nil
	}
	return ws.GetDb().Create(tags).Error
}

// deleteTrTagByTrId deletes all tags for a transaction.
func deleteTrTagByTrId(ws *workspace.Workspace, trId string) error {
	return ws.GetDb().Delete(&models.TrTag{}, "transaction_id = ?", trId).Error
}

// deleteTrTagByLedgerId deletes all tags for a ledger.
func deleteTrTagByLedgerId(ws *workspace.Workspace, ledgerId string) error {
	return ws.GetDb().Delete(&models.TrTag{}, "ledger_id = ?", ledgerId).Error
}

// deleteTrTagByTag deletes all tag entries for a specific tag name within a ledger.
func deleteTrTagByTag(ws *workspace.Workspace, ledgerId string, tag string) error {
	return ws.GetDb().
		Where("ledger_id = ? AND tag = ?", ledgerId, tag).
		Delete(&models.TrTag{}).Error
}

// queryTrTagsByTrIds batch queries tags for multiple transaction IDs.
func queryTrTagsByTrIds(ws *workspace.Workspace, trIds []string) (map[string][]*models.TrTag, error) {
	if len(trIds) == 0 {
		return make(map[string][]*models.TrTag), nil
	}
	trTags := make([]*models.TrTag, 0)
	if err := ws.GetDb().Where("transaction_id IN ?", trIds).Find(&trTags).Error; err != nil {
		return nil, err
	}
	result := make(map[string][]*models.TrTag)
	for _, tag := range trTags {
		result[tag.TransactionID] = append(result[tag.TransactionID], tag)
	}
	return result, nil
}

// ---- Service methods ----

// CreateTr creates a transaction record and its tags in a single transaction.
func (t *transactionRecordServiceImpl) CreateTr(ws *workspace.Workspace, trDto *dto.TransactionRecordDto) (string, error) {
	logrus.Infof("start to create transaction record, ledger id: %s, description: %s", trDto.LedgerID, trDto.Description)

	transactionID := util.GetUUID()

	record := trDto.ToTransactionRecord()
	record.TransactionID = transactionID

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		if err := createTrRecord(tx, record); err != nil {
			return fmt.Errorf("create transaction record: %w", err)
		}

		trTags := make([]*models.TrTag, 0, len(trDto.Tags))
		for _, tag := range trDto.Tags {
			trTag := &models.TrTag{
				LedgerID:      trDto.LedgerID,
				TransactionID: transactionID,
				Tag:           tag,
			}
			trTags = append(trTags, trTag)
		}
		if err := createTrTags(tx, trTags); err != nil {
			return fmt.Errorf("create tr tags: %w", err)
		}
		return nil
	})

	if err != nil {
		logrus.Errorf("create transaction record failed: %v", err)
		return "", err
	}

	logrus.Infof("create transaction record success, ledger id: %s, description: %s", trDto.LedgerID, trDto.Description)
	return transactionID, nil
}

// BatchCreateTr creates multiple transaction records in a single transaction.
func (t *transactionRecordServiceImpl) BatchCreateTr(ws *workspace.Workspace, dtos []*dto.TransactionRecordDto) (int, error) {
	logrus.Infof("start to batch create %d transaction records", len(dtos))

	if len(dtos) == 0 {
		return 0, nil
	}

	successCount := 0

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		for _, trDto := range dtos {
			transactionID := util.GetUUID()

			record := trDto.ToTransactionRecord()
			record.TransactionID = transactionID

			if err := createTrRecord(tx, record); err != nil {
				logrus.Errorf("batch create: create transaction record failed: %v", err)
				return fmt.Errorf("create transaction record: %w", err)
			}

			trTags := make([]*models.TrTag, 0, len(trDto.Tags))
			for _, tag := range trDto.Tags {
				trTag := &models.TrTag{
					LedgerID:      trDto.LedgerID,
					TransactionID: transactionID,
					Tag:           tag,
				}
				trTags = append(trTags, trTag)
			}
			if err := createTrTags(tx, trTags); err != nil {
				logrus.Errorf("batch create: create tr tags failed: %v", err)
				return fmt.Errorf("create tr tags: %w", err)
			}

			successCount++
		}
		return nil
	})

	if err != nil {
		logrus.Errorf("batch create transaction records failed: %v", err)
		return successCount, err
	}

	logrus.Infof("batch create transaction records success, count: %d", successCount)
	return successCount, nil
}

func convertSortFields(dtoSortFields []dto.QueryConditionSortField) []operator.SortField {
	if len(dtoSortFields) == 0 {
		return []operator.SortField{
			{Field: "transactionAt", Order: operator.Desc},
		}
	}
	result := make([]operator.SortField, 0, len(dtoSortFields))
	for _, sf := range dtoSortFields {
		order := operator.Desc
		if sf.Order == "asc" {
			order = operator.Asc
		}
		result = append(result, operator.SortField{
			Field: sf.Field,
			Order: order,
		})
	}
	return result
}

func (t *transactionRecordServiceImpl) QueryTrsOnCondition(ws *workspace.Workspace, condition *dto.TrQueryCondition) (*dto.TrQueryResult, error) {
	logrus.Infof("start to query trs, condition: %#v", condition)

	trs, err := queryTrsOnConditionRaw(ws, condition)
	if err != nil {
		return nil, err
	}

	trIds := make([]string, len(trs))
	for i, tr := range trs {
		trIds[i] = tr.TransactionID
	}
	tagMap, err := queryTrTagsByTrIds(ws, trIds)
	if err != nil {
		return nil, err
	}

	trDtos := make([]*dto.TransactionRecordDto, 0, len(trs))
	for _, tr := range trs {
		trDto := &dto.TransactionRecordDto{}
		trDto.FromTransactionRecord(tr)
		if tags, ok := tagMap[tr.TransactionID]; ok {
			for _, tag := range tags {
				trDto.Tags = append(trDto.Tags, tag.Tag)
			}
		}
		trDtos = append(trDtos, trDto)
	}

	sortFields := convertSortFields(condition.SortFields)
	summary := operator.NewTrOperator().
		Add(trDtos).
		Filter(condition.Items).
		Sort(sortFields).
		Page(condition.Offset, condition.Limit).
		Summary()

	logrus.Infof("query trs by page success, len: %d", len(summary.Items))
	return summary, nil
}

func (t *transactionRecordServiceImpl) QueryTrsForChart(ws *workspace.Workspace, req *dto.ChartQueryRequest) (*dto.ChartQueryResponse, error) {
	logrus.Infof("start to query trs for chart, granularity: %s, lines: %d", req.Granularity, len(req.Lines))

	ttSet := make(map[string]bool)
	for _, line := range req.Lines {
		ttSet[line.TransactionType] = true
	}

	trs, err := queryTrsOnConditionRaw(ws, &dto.TrQueryCondition{
		LedgerID: req.LedgerID,
		TsRange:  req.TsRange,
	})
	if err != nil {
		return nil, err
	}

	trIds := make([]string, len(trs))
	for i, tr := range trs {
		trIds[i] = tr.TransactionID
	}
	tagMap, err := queryTrTagsByTrIds(ws, trIds)
	if err != nil {
		return nil, err
	}

	trDtos := make([]*dto.TransactionRecordDto, 0, len(trs))
	for _, tr := range trs {
		trDto := &dto.TransactionRecordDto{}
		trDto.FromTransactionRecord(tr)
		if tags, ok := tagMap[tr.TransactionID]; ok {
			for _, tag := range tags {
				trDto.Tags = append(trDto.Tags, tag.Tag)
			}
		}
		trDtos = append(trDtos, trDto)
	}

	response := &dto.ChartQueryResponse{
		Lines: make([]dto.ChartLineData, 0, len(req.Lines)),
	}

	for _, line := range req.Lines {
		var filtered []*dto.TransactionRecordDto
		for _, tr := range trDtos {
			if tr.TransactionType != line.TransactionType {
				continue
			}
			if !line.IncludeOutlier && tr.Outlier {
				continue
			}
			filtered = append(filtered, tr)
		}

		filtered = operator.NewTrOperator().
			Add(filtered).
			Filter(line.Conditions).
			Summary().
			Items

		response.Lines = append(response.Lines, dto.ChartLineData{
			Label: line.Label,
			Type:  line.TransactionType,
			Items: filtered,
		})
	}

	logrus.Infof("query trs for chart success, lines: %d", len(response.Lines))
	return response, nil
}

func (t *transactionRecordServiceImpl) DeleteTrById(ws *workspace.Workspace, trId string) error {
	logrus.Infof("start to delete transaction record, tr id: %s", trId)

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		if err := deleteTrTagByTrId(tx, trId); err != nil {
			return fmt.Errorf("delete tr tags: %w", err)
		}
		if err := deleteTrById(tx, trId); err != nil {
			return fmt.Errorf("delete transaction record: %w", err)
		}
		return nil
	})

	if err != nil {
		logrus.Errorf("delete transaction record failed: %v", err)
		return err
	}

	logrus.Infof("delete transaction record success, tr id: %s", trId)
	return nil
}

func (t *transactionRecordServiceImpl) LinkToKeyEvent(ws *workspace.Workspace, trId string, date string) error {
	logrus.Infof("link transaction %s to key event date %s", trId, date)

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		tr, err := queryTrById(tx, trId)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("transaction not found: %s", trId)
			}
			return fmt.Errorf("query transaction: %w", err)
		}

		if err := updateKeyEventDate(tx, trId, date); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("transaction not found: %s", trId)
			}
			return fmt.Errorf("update key event date: %w", err)
		}

		// Use injected keyEventSvc instead of global GetKeyEventService()
		_, keyErr := t.keyEventSvc.QueryByDate(tx, tr.LedgerID, date)
		if keyErr != nil && !errors.Is(keyErr, gorm.ErrRecordNotFound) {
			return fmt.Errorf("check key event: %w", keyErr)
		}
		if keyErr != nil && errors.Is(keyErr, gorm.ErrRecordNotFound) {
			upsertErr := t.keyEventSvc.UpsertKeyEvent(tx, tr.LedgerID, date, "", "", "")
			if upsertErr != nil {
				return fmt.Errorf("auto-create key event: %w", upsertErr)
			}
			logrus.Infof("auto-created empty key event for date %s", date)
		}
		return nil
	})

	if err != nil {
		logrus.Errorf("link transaction %s to key event date %s failed: %v", trId, date, err)
		return err
	}

	logrus.Infof("linked transaction %s to key event date %s", trId, date)
	return nil
}

func (t *transactionRecordServiceImpl) UnlinkFromKeyEvent(ws *workspace.Workspace, trId string) error {
	logrus.Infof("unlink transaction %s from key event", trId)

	if err := updateKeyEventDate(ws, trId, ""); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("transaction not found: %s", trId)
		}
		return fmt.Errorf("unlink key event date: %w", err)
	}

	logrus.Infof("unlinked transaction %s from key event", trId)
	return nil
}

func (t *transactionRecordServiceImpl) QueryLinkedByDate(ws *workspace.Workspace, date string) ([]*dto.TransactionRecordDto, error) {
	logrus.Infof("query linked transactions for date %s", date)

	trs, err := queryByKeyEventDate(ws, date)
	if err != nil {
		return nil, fmt.Errorf("query by key event date: %w", err)
	}

	trIds := make([]string, len(trs))
	for i, tr := range trs {
		trIds[i] = tr.TransactionID
	}
	tagMap, err := queryTrTagsByTrIds(ws, trIds)
	if err != nil {
		return nil, fmt.Errorf("query tr tags: %w", err)
	}

	dtos := make([]*dto.TransactionRecordDto, 0, len(trs))
	for _, tr := range trs {
		trDto := &dto.TransactionRecordDto{}
		trDto.FromTransactionRecord(tr)
		if tags, ok := tagMap[tr.TransactionID]; ok {
			for _, tag := range tags {
				trDto.Tags = append(trDto.Tags, tag.Tag)
			}
		}
		dtos = append(dtos, trDto)
	}

	logrus.Infof("query linked transactions for date %s, count: %d", date, len(dtos))
	return dtos, nil
}
