package service

import (
	"errors"
	"fmt"

	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/pkg/operator"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
	"gorm.io/gorm"
)

var trSvc TransactionRecordService

func SetTrService(svc TransactionRecordService) { trSvc = svc }
func GetTrService() TransactionRecordService      { return trSvc }

func NewTrService(trDao dao.TransactionRecordDao, trTagDao dao.TrTagDao) TransactionRecordService {
	return &transactionRecordServiceImpl{
		trDao:    trDao,
		trTagDao: trTagDao,
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
	trDao    dao.TransactionRecordDao
	trTagDao dao.TrTagDao
}

// CreateTr creates a transaction record and its tags in a single transaction.
func (t *transactionRecordServiceImpl) CreateTr(ws *workspace.Workspace, trDto *dto.TransactionRecordDto) (string, error) {
	logrus.Infof("start to create transaction record, ledger id: %s, description: %s", trDto.LedgerID, trDto.Description)

	transactionID := util.GetUUID()

	record := trDto.ToTransactionRecord()
	record.TransactionID = transactionID

	// Use transaction for atomicity
	err := ws.Transaction(func(tx *workspace.Workspace) error {
		if err := t.trDao.CreateTr(tx, record); err != nil {
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
		if err := t.trTagDao.CreateTrTags(tx, trTags); err != nil {
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

	// Use transaction for atomicity
	err := ws.Transaction(func(tx *workspace.Workspace) error {
		for _, trDto := range dtos {
			transactionID := util.GetUUID()

			record := trDto.ToTransactionRecord()
			record.TransactionID = transactionID

			if err := t.trDao.CreateTr(tx, record); err != nil {
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
			if err := t.trTagDao.CreateTrTags(tx, trTags); err != nil {
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

// convertSortFields converts DTO sort fields to operator sort fields
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

	// Query all matching transaction records
	trs, err := t.trDao.QueryTrsOnCondition(ws, condition)
	if err != nil {
		return nil, err
	}

	// Batch query all tags in a single query (fixes N+1 problem)
	trIds := make([]string, len(trs))
	for i, tr := range trs {
		trIds[i] = tr.TransactionID
	}
	tagMap, err := t.trTagDao.QueryTrTagsByTrIds(ws, trIds)
	if err != nil {
		return nil, err
	}

	// Assemble DTOs
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

	// Filter, sort, paginate and summarize
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

	// Collect all transaction types needed for chart lines
	ttSet := make(map[string]bool)
	for _, line := range req.Lines {
		ttSet[line.TransactionType] = true
	}

	// Query all matching transaction records from DAO (without detailed filter)
	trs, err := t.trDao.QueryTrsOnCondition(ws, &dto.TrQueryCondition{
		LedgerID: req.LedgerID,
		TsRange:  req.TsRange,
	})
	if err != nil {
		return nil, err
	}

	// Batch query tags
	trIds := make([]string, len(trs))
	for i, tr := range trs {
		trIds[i] = tr.TransactionID
	}
	tagMap, err := t.trTagDao.QueryTrTagsByTrIds(ws, trIds)
	if err != nil {
		return nil, err
	}

	// Build DTOs with tags
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

	// Process each chart line - filter records per line
	response := &dto.ChartQueryResponse{
		Lines: make([]dto.ChartLineData, 0, len(req.Lines)),
	}

	for _, line := range req.Lines {
		// Filter by transaction type and outlier flag first
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

		// Apply conditions with OR logic using TrOperator
		// TrOperator.Filter uses OR between conditions (any condition matches)
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

	// Use transaction for atomicity
	err := ws.Transaction(func(tx *workspace.Workspace) error {
		if err := t.trTagDao.DeleteTrTagByTrId(tx, trId); err != nil {
			return fmt.Errorf("delete tr tags: %w", err)
		}
		if err := t.trDao.DeleteTrById(tx, trId); err != nil {
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
		tr, err := t.trDao.QueryById(tx, trId)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("transaction not found: %s", trId)
			}
			return fmt.Errorf("query transaction: %w", err)
		}

		if err := t.trDao.UpdateKeyEventDate(tx, trId, date); err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return fmt.Errorf("transaction not found: %s", trId)
			}
			return fmt.Errorf("update key event date: %w", err)
		}

		keyEventSvc := GetKeyEventService()
		_, keyErr := keyEventSvc.QueryByDate(tx, tr.LedgerID, date)
		if keyErr != nil && !errors.Is(keyErr, gorm.ErrRecordNotFound) {
			return fmt.Errorf("check key event: %w", keyErr)
		}
		if keyErr != nil && errors.Is(keyErr, gorm.ErrRecordNotFound) {
			upsertErr := keyEventSvc.UpsertKeyEvent(tx, tr.LedgerID, date, "", "", "")
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

	if err := t.trDao.UpdateKeyEventDate(ws, trId, ""); err != nil {
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

	trs, err := t.trDao.QueryByKeyEventDate(ws, date)
	if err != nil {
		return nil, fmt.Errorf("query by key event date: %w", err)
	}

	trIds := make([]string, len(trs))
	for i, tr := range trs {
		trIds[i] = tr.TransactionID
	}
	tagMap, err := t.trTagDao.QueryTrTagsByTrIds(ws, trIds)
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
