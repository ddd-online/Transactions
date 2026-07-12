package service

import (
	"encoding/json"
	"fmt"

	"github.com/billadm/dao"
	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

func NewChartService(chartDao dao.ChartDao) ChartService {
	return &chartServiceImpl{
		chartDao: chartDao,
	}
}

type ChartService interface {
	Create(ws *workspace.Workspace, req *dto.CreateChartRequest) (*dto.ChartDto, error)
	DeleteById(ws *workspace.Workspace, chartId string) error
	ListByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*dto.ChartDto, error)
	Update(ws *workspace.Workspace, req *dto.UpdateChartRequest) (*dto.ChartDto, error)
}

var _ ChartService = &chartServiceImpl{}

type chartServiceImpl struct {
	chartDao dao.ChartDao
}

func defaultChartLines() []models.ChartLine {
	return []models.ChartLine{
		{Label: "支出", TransactionType: "expense", IncludeOutlier: false, Conditions: []models.QueryConditionItem{}},
		{Label: "收入", TransactionType: "income", IncludeOutlier: false, Conditions: []models.QueryConditionItem{}},
		{Label: "转账", TransactionType: "transfer", IncludeOutlier: false, Conditions: []models.QueryConditionItem{}},
	}
}

func (t *chartServiceImpl) seedDefaultCharts(ws *workspace.Workspace, ledgerID string) error {
	count, err := t.chartDao.CountByLedgerId(ws, ledgerID)
	if err != nil {
		logrus.Warnf("统计图表数量失败: %v", err)
		return err
	}
	if count > 0 {
		return nil
	}
	logrus.Infof("账本 %s 无图表，创建预设图表", ledgerID)

	monthlyLines := defaultChartLines()
	yearlyLines := []models.ChartLine{
		{Label: "支出", TransactionType: "expense", IncludeOutlier: true, Conditions: []models.QueryConditionItem{}},
		{Label: "收入", TransactionType: "income", IncludeOutlier: true, Conditions: []models.QueryConditionItem{}},
		{Label: "转账", TransactionType: "transfer", IncludeOutlier: true, Conditions: []models.QueryConditionItem{}},
	}
	incomeLines := []models.ChartLine{
		{Label: "年度总收入", TransactionType: "income", IncludeOutlier: true, Conditions: []models.QueryConditionItem{}},
		{Label: "年度工资收入", TransactionType: "income", IncludeOutlier: true,
			Conditions: []models.QueryConditionItem{{TransactionType: "income", Category: "工资奖金", Tags: []string{"工资"}, TagPolicy: "all"}}},
		{Label: "年度奖金收入", TransactionType: "income", IncludeOutlier: true,
			Conditions: []models.QueryConditionItem{{TransactionType: "income", Category: "工资奖金", Tags: []string{"奖金"}, TagPolicy: "all", Description: "年奖金"}}},
		{Label: "年度分红收入", TransactionType: "income", IncludeOutlier: true,
			Conditions: []models.QueryConditionItem{{TransactionType: "income", Category: "投资理财", Tags: []string{}, TagPolicy: "all", Description: "年分红"}}},
	}

	presets := []struct {
		title, granularity string
		lines              []models.ChartLine
		sortOrder          int
	}{
		{"月度消费趋势", "month", monthlyLines, 0},
		{"年度消费趋势", "year", yearlyLines, 1},
		{"年度收入趋势", "year", incomeLines, 2},
	}

	for _, p := range presets {
		linesJSON, err := json.Marshal(p.lines)
		if err != nil {
			return fmt.Errorf("marshal %s: %w", p.title, err)
		}
		if err := t.chartDao.Create(ws, &models.Chart{
			ChartID: util.GetUUID(), LedgerID: ledgerID, Title: p.title,
			Granularity: p.granularity, ChartLines: string(linesJSON), ChartType: "line",
			IsPreset: true, SortOrder: p.sortOrder,
		}); err != nil {
			return fmt.Errorf("seed %s: %w", p.title, err)
		}
	}

	logrus.Infof("已为账本 %s 创建 3 个预设图表", ledgerID)
	return nil
}

func (t *chartServiceImpl) Create(ws *workspace.Workspace, req *dto.CreateChartRequest) (*dto.ChartDto, error) {
	chartID := util.GetUUID()

	maxSortOrder, err := t.chartDao.GetMaxSort(ws, req.LedgerID)
	if err != nil {
		return nil, err
	}

	linesJSON, err := json.Marshal(req.Lines)
	if err != nil {
		return nil, fmt.Errorf("marshal chart lines failed: %w", err)
	}

	chart := &models.Chart{
		ChartID:     chartID,
		LedgerID:    req.LedgerID,
		Title:       req.Title,
		Granularity: req.Granularity,
		ChartLines:  string(linesJSON),
		ChartType:   req.ChartType,
		IsPreset:    false,
		SortOrder:   maxSortOrder + 1,
	}

	if err := t.chartDao.Create(ws, chart); err != nil {
		return nil, fmt.Errorf("create chart failed: %w", err)
	}

	return t.toDto(chart)
}

func (t *chartServiceImpl) DeleteById(ws *workspace.Workspace, chartId string) error {
	if err := t.chartDao.DeleteById(ws, chartId); err != nil {
		return fmt.Errorf("delete chart failed: %w", err)
	}

	return nil
}

func (t *chartServiceImpl) ListByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*dto.ChartDto, error) {
	if err := t.seedDefaultCharts(ws, ledgerId); err != nil {
		logrus.Warnf("为账本 %s 创建预设图表失败: %v", ledgerId, err)
	}

	charts, err := t.chartDao.QueryByLedgerId(ws, ledgerId)
	if err != nil {
		return nil, err
	}

	dtos := make([]*dto.ChartDto, 0, len(charts))
	for _, chart := range charts {
		dto, err := t.toDto(chart)
		if err != nil {
			return nil, err
		}
		dtos = append(dtos, dto)
	}

	return dtos, nil
}

func (t *chartServiceImpl) Update(ws *workspace.Workspace, req *dto.UpdateChartRequest) (*dto.ChartDto, error) {
	chart, err := t.chartDao.QueryById(ws, req.ChartID)
	if err != nil {
		return nil, fmt.Errorf("get chart failed: %w", err)
	}

	linesJSON, err := json.Marshal(req.Lines)
	if err != nil {
		return nil, fmt.Errorf("marshal chart lines failed: %w", err)
	}

	chart.Title = req.Title
	chart.Granularity = req.Granularity
	chart.ChartLines = string(linesJSON)
	chart.ChartType = req.ChartType
	chart.SortOrder = req.SortOrder

	if err := t.chartDao.Save(ws, chart); err != nil {
		return nil, fmt.Errorf("update chart failed: %w", err)
	}

	return t.toDto(chart)
}

func (t *chartServiceImpl) toDto(chart *models.Chart) (*dto.ChartDto, error) {
	var lines []dto.ChartLine
	if err := json.Unmarshal([]byte(chart.ChartLines), &lines); err != nil {
		return nil, fmt.Errorf("unmarshal chart lines failed: %w", err)
	}

	return &dto.ChartDto{
		ChartID:     chart.ChartID,
		LedgerID:    chart.LedgerID,
		Title:       chart.Title,
		Granularity: chart.Granularity,
		Lines:       lines,
		ChartType:   chart.ChartType,
		IsPreset:    chart.IsPreset,
		SortOrder:   chart.SortOrder,
	}, nil
}
