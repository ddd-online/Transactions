package service

import (
	"encoding/json"
	"fmt"

	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/util"
	"github.com/billadm/workspace"
	"github.com/sirupsen/logrus"
)

var chartSvc ChartService

func SetChartService(svc ChartService) { chartSvc = svc }
func GetChartService() ChartService      { return chartSvc }

func NewChartService() ChartService {
	return &chartServiceImpl{}
}

type ChartService interface {
	Create(ws *workspace.Workspace, req *dto.CreateChartRequest) (*dto.ChartDto, error)
	DeleteById(ws *workspace.Workspace, chartId string) error
	ListByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*dto.ChartDto, error)
	Update(ws *workspace.Workspace, req *dto.UpdateChartRequest) (*dto.ChartDto, error)
}

var _ ChartService = &chartServiceImpl{}

type chartServiceImpl struct{}

func defaultChartLines() []models.ChartLine {
	return []models.ChartLine{
		{Label: "支出", TransactionType: "expense", IncludeOutlier: false, Conditions: []models.QueryConditionItem{}},
		{Label: "收入", TransactionType: "income", IncludeOutlier: false, Conditions: []models.QueryConditionItem{}},
		{Label: "转账", TransactionType: "transfer", IncludeOutlier: false, Conditions: []models.QueryConditionItem{}},
	}
}

// seedDefaultCharts inserts the 3 preset trend charts for a ledger if none exist.
func (t *chartServiceImpl) seedDefaultCharts(ws *workspace.Workspace, ledgerID string) error {
	var count int64
	if err := ws.GetDb().Model(&models.Chart{}).Where("ledger_id = ?", ledgerID).Count(&count).Error; err != nil {
		return err
	}
	if count > 0 {
		return nil
	}

	monthlyLines := defaultChartLines()

	yearlyLines := []models.ChartLine{
		{Label: "支出", TransactionType: "expense", IncludeOutlier: true, Conditions: []models.QueryConditionItem{}},
		{Label: "收入", TransactionType: "income", IncludeOutlier: true, Conditions: []models.QueryConditionItem{}},
		{Label: "转账", TransactionType: "transfer", IncludeOutlier: true, Conditions: []models.QueryConditionItem{}},
	}

	incomeLines := []models.ChartLine{
		{Label: "年度总收入", TransactionType: "income", IncludeOutlier: true, Conditions: []models.QueryConditionItem{}},
		{
			Label: "年度工资收入", TransactionType: "income", IncludeOutlier: true,
			Conditions: []models.QueryConditionItem{
				{TransactionType: "income", Category: "工资奖金", Tags: []string{"工资"}, TagPolicy: "all"},
			},
		},
		{
			Label: "年度奖金收入", TransactionType: "income", IncludeOutlier: true,
			Conditions: []models.QueryConditionItem{
				{TransactionType: "income", Category: "工资奖金", Tags: []string{"奖金"}, TagPolicy: "all", Description: "年奖金"},
			},
		},
		{
			Label: "年度分红收入", TransactionType: "income", IncludeOutlier: true,
			Conditions: []models.QueryConditionItem{
				{TransactionType: "income", Category: "投资理财", Tags: []string{}, TagPolicy: "all", Description: "年分红"},
			},
		},
	}

	presets := []struct {
		title       string
		granularity string
		chartType   string
		lines       []models.ChartLine
	}{
		{"月度消费趋势", "month", "line", monthlyLines},
		{"年度消费趋势", "year", "line", yearlyLines},
		{"年度收入趋势", "year", "line", incomeLines},
	}

	for i, p := range presets {
		linesJSON, err := json.Marshal(p.lines)
		if err != nil {
			return fmt.Errorf("marshal preset chart lines: %w", err)
		}
		chart := &models.Chart{
			ChartID:     util.GetUUID(),
			LedgerID:    ledgerID,
			Title:       p.title,
			Granularity: p.granularity,
			ChartLines:  string(linesJSON),
			ChartType:   p.chartType,
			IsPreset:    true,
			SortOrder:   i,
		}
		if err := ws.GetDb().Create(chart).Error; err != nil {
			return fmt.Errorf("seed preset chart %q: %w", p.title, err)
		}
	}

	logrus.Infof("seeded %d default charts for ledger %s", len(presets), ledgerID)
	return nil
}

func (t *chartServiceImpl) Create(ws *workspace.Workspace, req *dto.CreateChartRequest) (*dto.ChartDto, error) {
	chartID := util.GetUUID()

	var maxSortOrder int
	if err := ws.GetDb().Model(&models.Chart{}).
		Where("ledger_id = ?", req.LedgerID).
		Select("COALESCE(MAX(sort_order), 0)").
		Scan(&maxSortOrder).Error; err != nil {
		return nil, err
	}

	linesJSON, err := json.Marshal(req.Lines)
	if err != nil {
		return nil, fmt.Errorf("marshal chart lines failed: %w", err)
	}

	chart := &models.Chart{
		ChartID:     chartID,
		LedgerID:    req.LedgerID,
		Title:      req.Title,
		Granularity:  req.Granularity,
		ChartLines:   string(linesJSON),
		ChartType:   req.ChartType,
		IsPreset:    false,
		SortOrder:   maxSortOrder + 1,
	}

	if err := ws.GetDb().Create(chart).Error; err != nil {
		return nil, fmt.Errorf("create chart failed: %w", err)
	}

	logrus.Infof("create chart success, chart id: %s", chartID)

	return t.toDto(chart)
}

func (t *chartServiceImpl) DeleteById(ws *workspace.Workspace, chartId string) error {
	if err := ws.GetDb().
		Where("chart_id = ?", chartId).
		Delete(&models.Chart{}).Error; err != nil {
		return fmt.Errorf("delete chart failed: %w", err)
	}

	logrus.Infof("delete chart success, chart id: %s", chartId)
	return nil
}

func (t *chartServiceImpl) ListByLedgerId(ws *workspace.Workspace, ledgerId string) ([]*dto.ChartDto, error) {
	// Lazy seed default charts for new ledgers
	if err := t.seedDefaultCharts(ws, ledgerId); err != nil {
		logrus.Errorf("seed default charts failed: %v", err)
	}

	charts := make([]*models.Chart, 0)
	if err := ws.GetDb().
		Where("ledger_id = ?", ledgerId).
		Order("is_preset DESC, sort_order ASC, created_at DESC").
		Find(&charts).Error; err != nil {
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
	chart, err := t.getById(ws, req.ChartID)
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

	if err := ws.GetDb().Save(chart).Error; err != nil {
		return nil, fmt.Errorf("update chart failed: %w", err)
	}

	logrus.Infof("update chart success, chart id: %s", req.ChartID)

	return t.toDto(chart)
}

func (t *chartServiceImpl) getById(ws *workspace.Workspace, chartId string) (*models.Chart, error) {
	var chart models.Chart
	err := ws.GetDb().Where("chart_id = ?", chartId).First(&chart).Error
	return &chart, err
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
		Granularity:  chart.Granularity,
		Lines:       lines,
		ChartType:   chart.ChartType,
		IsPreset:    chart.IsPreset,
		SortOrder:   chart.SortOrder,
	}, nil
}
