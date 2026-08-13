package service

import (
	"errors"
	"fmt"
	"strconv"
	"time"

	"github.com/billadm/dao"
	"github.com/billadm/constant"
	"github.com/billadm/models"
	"github.com/billadm/models/dto"
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
	QueryLinkedByDate(ws *workspace.Workspace, ledgerId string, date string) ([]*dto.TransactionRecordDto, error)
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

	records := make([]*models.TransactionRecord, 0, len(dtos))
	trTags := make([]*models.TrTag, 0)

	for _, trDto := range dtos {
		transactionID := util.GetUUID()

		record := trDto.ToTransactionRecord()
		record.TransactionID = transactionID
		records = append(records, record)

		for _, tag := range trDto.Tags {
			trTags = append(trTags, &models.TrTag{
				LedgerID:      trDto.LedgerID,
				TransactionID: transactionID,
				Tag:           tag,
			})
		}
	}

	err := ws.Transaction(func(tx *workspace.Workspace) error {
		// CreateInBatches 分批 INSERT，避免逐条写入的 SQL 编译开销
		if err := t.trDao.CreateBatch(tx, records); err != nil {
			logrus.Errorf("批量创建: 创建交易记录失败: %v", err)
			return fmt.Errorf("create transaction records: %w", err)
		}
		if len(trTags) > 0 {
			if err := t.trTagDao.CreateBatch(tx, trTags); err != nil {
				logrus.Errorf("批量创建: 创建标签关联失败: %v", err)
				return fmt.Errorf("create tr tags: %w", err)
			}
		}
		return nil
	})

	if err != nil {
		logrus.Errorf("批量创建交易记录失败: %v", err)
		return 0, err
	}

	logrus.Infof("批量创建交易记录成功, 数量: %d", len(dtos))
	return len(dtos), nil
}

func (t *transactionRecordServiceImpl) QueryTrsOnCondition(ws *workspace.Workspace, condition *dto.TrQueryCondition) (*dto.TrQueryResult, error) {
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
	// 避免 pageSize=0（Limit<=0 且无结果）触发整数除零 panic
	totalPages := 0
	if pageSize > 0 {
		totalPages = int(result.Total) / pageSize
		if int(result.Total)%pageSize != 0 {
			totalPages++
		}
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

func (t *transactionRecordServiceImpl) QueryTrsForChart(ws *workspace.Workspace, req *dto.ChartQueryRequest) (*dto.ChartQueryResponse, error) {
	// 每条曲线在 SQL 中完成过滤 + 时间桶聚合，只返回序列点
	linePoints := make([][]dto.ChartPoint, len(req.Lines))
	minBucket, maxBucket := "", ""
	for i, line := range req.Lines {
		points, err := t.trDao.QueryChartLineData(ws, req.LedgerID, req.TsRange, req.Granularity, line)
		if err != nil {
			return nil, fmt.Errorf("query chart line %q: %w", line.Label, err)
		}
		linePoints[i] = points
		for _, p := range points {
			if minBucket == "" || p.Time < minBucket {
				minBucket = p.Time
			}
			if maxBucket == "" || p.Time > maxBucket {
				maxBucket = p.Time
			}
		}
	}

	stats, err := t.trDao.QueryStatistics(ws, req.LedgerID, req.TsRange)
	if err != nil {
		return nil, fmt.Errorf("query chart statistics: %w", err)
	}

	labels := chartTimeLabels(minBucket, maxBucket, req.Granularity)
	lines := make([]dto.ChartLineData, 0, len(req.Lines))
	for i, line := range req.Lines {
		byBucket := make(map[string]int64, len(linePoints[i]))
		for _, p := range linePoints[i] {
			byBucket[p.Time] = p.Amount
		}
		data := make([]dto.ChartPoint, 0, len(labels))
		for _, label := range labels {
			data = append(data, dto.ChartPoint{Time: label, Amount: byBucket[label]})
		}
		lines = append(lines, dto.ChartLineData{
			Label: line.Label,
			Type:  line.TransactionType,
			Data:  data,
		})
	}

	return &dto.ChartQueryResponse{
		Lines: lines,
		Statistics: map[string]int64{
			constant.TransactionTypeIncome:   stats.Income,
			constant.TransactionTypeExpense:  stats.Expense,
			constant.TransactionTypeTransfer: stats.Transfer,
		},
	}, nil
}

// chartTimeLabels 根据所有曲线数据的实际桶范围生成连续时间轴并补零。
// 桶格式：month -> "2026-01"，year -> "2026"（字典序即时间序）。
func chartTimeLabels(minBucket, maxBucket, granularity string) []string {
	if minBucket == "" {
		return nil
	}
	if granularity == "year" {
		minYear, errMin := strconv.Atoi(minBucket)
		maxYear, errMax := strconv.Atoi(maxBucket)
		if errMin != nil || errMax != nil {
			return nil
		}
		labels := make([]string, 0, maxYear-minYear+1)
		for y := minYear; y <= maxYear; y++ {
			labels = append(labels, strconv.Itoa(y))
		}
		return labels
	}

	start, errStart := time.Parse("2006-01", minBucket)
	end, errEnd := time.Parse("2006-01", maxBucket)
	if errStart != nil || errEnd != nil {
		return nil
	}
	var labels []string
	for !start.After(end) {
		labels = append(labels, start.Format("2006-01"))
		start = start.AddDate(0, 1, 0)
	}
	return labels
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

func (t *transactionRecordServiceImpl) QueryLinkedByDate(ws *workspace.Workspace, ledgerId string, date string) ([]*dto.TransactionRecordDto, error) {
	trs, err := t.trDao.QueryByKeyEventDate(ws, ledgerId, date)
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
