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

func NewTrService(keyEventSvc KeyEventService, trDao dao.TransactionRecordDao, trTagDao dao.TrTagDao) TransactionRecordService {
	return &transactionRecordServiceImpl{
		keyEventSvc: keyEventSvc,
		trDao:       trDao,
		trTagDao:    trTagDao,
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
	trDao       dao.TransactionRecordDao
	trTagDao    dao.TrTagDao
}

func (t *transactionRecordServiceImpl) CreateTr(ws *workspace.Workspace, trDto *dto.TransactionRecordDto) (string, error) {
	transactionID := util.GetUUID()

	record := trDto.ToTransactionRecord()
	record.TransactionID = transactionID

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		if err := t.trDao.Create(tx, record); err != nil {
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
		if err := t.trTagDao.CreateBatch(tx, trTags); err != nil {
			return fmt.Errorf("create tr tags: %w", err)
		}
		return nil
	})

	if err != nil {
		logrus.Errorf("创建交易记录失败: %v", err)
		return "", err
	}

	return transactionID, nil
}

func (t *transactionRecordServiceImpl) BatchCreateTr(ws *workspace.Workspace, dtos []*dto.TransactionRecordDto) (int, error) {
	logrus.Infof("开始批量创建 %d 条交易记录", len(dtos))

	if len(dtos) == 0 {
		return 0, nil
	}

	successCount := 0

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		for _, trDto := range dtos {
			transactionID := util.GetUUID()

			record := trDto.ToTransactionRecord()
			record.TransactionID = transactionID

			if err := t.trDao.Create(tx, record); err != nil {
				logrus.Errorf("批量创建: 创建交易记录失败: %v", err)
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
			if err := t.trTagDao.CreateBatch(tx, trTags); err != nil {
				logrus.Errorf("批量创建: 创建标签关联失败: %v", err)
				return fmt.Errorf("create tr tags: %w", err)
			}

			successCount++
		}
		return nil
	})

	if err != nil {
		logrus.Errorf("批量创建交易记录失败: %v", err)
		return successCount, err
	}

	logrus.Infof("批量创建交易记录成功, 数量: %d", successCount)
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
	hasTagFilter := false
	for _, item := range condition.Items {
		if len(item.Tags) > 0 {
			hasTagFilter = true
			break
		}
	}

	if hasTagFilter {
		return t.queryWithTagFilter(ws, condition)
	}

	result, err := t.trDao.QueryFiltered(ws, condition)
	if err != nil {
		return nil, err
	}

	trIds := make([]string, len(result.Items))
	for i, tr := range result.Items {
		trIds[i] = tr.TransactionID
	}
	tagMap, err := t.trTagDao.QueryByTrIds(ws, trIds)
	if err != nil {
		return nil, err
	}

	trDtos := make([]*dto.TransactionRecordDto, 0, len(result.Items))
	for _, tr := range result.Items {
		trDto := &dto.TransactionRecordDto{}
		trDto.FromTransactionRecord(tr)
		if tags, ok := tagMap[tr.TransactionID]; ok {
			for _, tag := range tags {
				trDto.Tags = append(trDto.Tags, tag.Tag)
			}
		}
		trDtos = append(trDtos, trDto)
	}

	pageSize := condition.Limit
	if pageSize <= 0 {
		pageSize = len(trDtos)
	}
	totalPages := int(result.Total)/pageSize + 1
	if int(result.Total)%pageSize == 0 && result.Total > 0 {
		totalPages = int(result.Total) / pageSize
	}
	page := 1
	if condition.Limit > 0 && condition.Offset >= 0 {
		page = condition.Offset/condition.Limit + 1
	}

	return &dto.TrQueryResult{
		Items:      trDtos,
		Total:      result.Total,
		Page:       page,
		PageSize:   pageSize,
		TotalPages: totalPages,
		TrStatistics: map[string]int64{
			"income":   result.Statistics.Income,
			"expense":  result.Statistics.Expense,
			"transfer": result.Statistics.Transfer,
		},
	}, nil
}

func (t *transactionRecordServiceImpl) queryWithTagFilter(ws *workspace.Workspace, condition *dto.TrQueryCondition) (*dto.TrQueryResult, error) {
	trs, err := t.trDao.QueryByCondition(ws, condition)
	if err != nil {
		return nil, err
	}

	trIds := make([]string, len(trs))
	for i, tr := range trs {
		trIds[i] = tr.TransactionID
	}
	tagMap, err := t.trTagDao.QueryByTrIds(ws, trIds)
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

	return summary, nil
}

func (t *transactionRecordServiceImpl) QueryTrsForChart(ws *workspace.Workspace, req *dto.ChartQueryRequest) (*dto.ChartQueryResponse, error) {
	trs, err := t.trDao.QueryByCondition(ws, &dto.TrQueryCondition{
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
	tagMap, err := t.trTagDao.QueryByTrIds(ws, trIds)
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

	return response, nil
}

func (t *transactionRecordServiceImpl) DeleteTrById(ws *workspace.Workspace, trId string) error {
	err := ws.Transaction(func(tx *workspace.Workspace) error {
		if err := t.trTagDao.DeleteByTrId(tx, trId); err != nil {
			return fmt.Errorf("delete tr tags: %w", err)
		}
		if err := t.trDao.DeleteById(tx, trId); err != nil {
			return fmt.Errorf("delete transaction record: %w", err)
		}
		return nil
	})

	if err != nil {
		logrus.Errorf("删除交易记录失败: %v", err)
		return err
	}

	return nil
}

func (t *transactionRecordServiceImpl) LinkToKeyEvent(ws *workspace.Workspace, trId string, date string) error {
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

		_, keyErr := t.keyEventSvc.QueryByDate(tx, tr.LedgerID, date)
		if keyErr != nil && !errors.Is(keyErr, gorm.ErrRecordNotFound) {
			return fmt.Errorf("check key event: %w", keyErr)
		}
		if keyErr != nil && errors.Is(keyErr, gorm.ErrRecordNotFound) {
			upsertErr := t.keyEventSvc.UpsertKeyEvent(tx, tr.LedgerID, date, "", "", "")
			if upsertErr != nil {
				return fmt.Errorf("auto-create key event: %w", upsertErr)
			}
			logrus.Infof("自动创建空关键事件, 日期: %s", date)
		}
		return nil
	})

	if err != nil {
		logrus.Errorf("关联交易 %s 到关键事件 %s 失败: %v", trId, date, err)
		return err
	}

	return nil
}

func (t *transactionRecordServiceImpl) UnlinkFromKeyEvent(ws *workspace.Workspace, trId string) error {
	if err := t.trDao.UpdateKeyEventDate(ws, trId, ""); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return fmt.Errorf("transaction not found: %s", trId)
		}
		return fmt.Errorf("unlink key event date: %w", err)
	}

	return nil
}

func (t *transactionRecordServiceImpl) QueryLinkedByDate(ws *workspace.Workspace, date string) ([]*dto.TransactionRecordDto, error) {
	trs, err := t.trDao.QueryByKeyEventDate(ws, date)
	if err != nil {
		return nil, fmt.Errorf("query by key event date: %w", err)
	}

	trIds := make([]string, len(trs))
	for i, tr := range trs {
		trIds[i] = tr.TransactionID
	}
	tagMap, err := t.trTagDao.QueryByTrIds(ws, trIds)
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

	return dtos, nil
}
