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

// presetTitles are the titles of charts that should always exist for every ledger.
var presetTitles = []string{"月度消费趋势", "年度消费趋势", "年度收入趋势"}

// seedDefaultCharts inserts preset trend charts that don't yet exist for this ledger.
func (t *chartServiceImpl) seedDefaultCharts(ws *workspace.Workspace, ledgerID string) error {
	var existingTitles []string
	if err := ws.GetDb().Model(&models.Chart{}).
		Where("ledger_id = ? AND title IN ?", ledgerID, presetTitles).
		Pluck("title", &existingTitles).Error; err != nil {
		logrus.Warnf("seedDefaultCharts: query existing titles failed: %v", err)
		return err
	}
	existingSet := make(map[string]bool, len(existingTitles))
	for _, t := range existingTitles {
		existingSet[t] = true
	}

	missing := 0
	for _, t := range presetTitles {
		if !existingSet[t] {
			missing++
		}
	}
	if missing == 0 {
		return nil
	}
	logrus.Infof("seedDefaultCharts: ledger=%s, missing %d preset charts", ledgerID, missing)

	// Only create charts that are actually missing
	if !existingSet["月度消费趋势"] {
		monthlyLines := defaultChartLines()
		linesJSON, _ := json.Marshal(monthlyLines)
		if err := ws.GetDb().Create(&models.Chart{
			ChartID: util.GetUUID(), LedgerID: ledgerID, Title: "月度消费趋势",
			Granularity: "month", ChartLines: string(linesJSON), ChartType: "line",
			IsPreset: true, SortOrder: 0,
		}).Error; err != nil {
			return fmt.Errorf("seed 月度消费趋势: %w", err)
		}
		logrus.Infof("seeded 月度消费趋势 for ledger %s", ledgerID)
	}
	if !existingSet["年度消费趋势"] {
		yearlyLines := []models.ChartLine{
			{Label: "支出", TransactionType: "expense", IncludeOutlier: true, Conditions: []models.QueryConditionItem{}},
			{Label: "收入", TransactionType: "income", IncludeOutlier: true, Conditions: []models.QueryConditionItem{}},
			{Label: "转账", TransactionType: "transfer", IncludeOutlier: true, Conditions: []models.QueryConditionItem{}},
		}
		linesJSON, _ := json.Marshal(yearlyLines)
		if err := ws.GetDb().Create(&models.Chart{
			ChartID: util.GetUUID(), LedgerID: ledgerID, Title: "年度消费趋势",
			Granularity: "year", ChartLines: string(linesJSON), ChartType: "line",
			IsPreset: true, SortOrder: 1,
		}).Error; err != nil {
			return fmt.Errorf("seed 年度消费趋势: %w", err)
		}
		logrus.Infof("seeded 年度消费趋势 for ledger %s", ledgerID)
	}
	if !existingSet["年度收入趋势"] {
		incomeLines := []models.ChartLine{
			{Label: "年度总收入", TransactionType: "income", IncludeOutlier: true, Conditions: []models.QueryConditionItem{}},
			{Label: "年度工资收入", TransactionType: "income", IncludeOutlier: true,
				Conditions: []models.QueryConditionItem{{TransactionType: "income", Category: "工资奖金", Tags: []string{"工资"}, TagPolicy: "all"}}},
			{Label: "年度奖金收入", TransactionType: "income", IncludeOutlier: true,
				Conditions: []models.QueryConditionItem{{TransactionType: "income", Category: "工资奖金", Tags: []string{"奖金"}, TagPolicy: "all", Description: "年奖金"}}},
			{Label: "年度分红收入", TransactionType: "income", IncludeOutlier: true,
				Conditions: []models.QueryConditionItem{{TransactionType: "income", Category: "投资理财", Tags: []string{}, TagPolicy: "all", Description: "年分红"}}},
		}
		linesJSON, _ := json.Marshal(incomeLines)
		if err := ws.GetDb().Create(&models.Chart{
			ChartID: util.GetUUID(), LedgerID: ledgerID, Title: "年度收入趋势",
			Granularity: "year", ChartLines: string(linesJSON), ChartType: "line",
			IsPreset: true, SortOrder: 2,
		}).Error; err != nil {
			return fmt.Errorf("seed 年度收入趋势: %w", err)
		}
		logrus.Infof("seeded 年度收入趋势 for ledger %s", ledgerID)
	}

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
		logrus.Warnf("seed default charts failed for ledger %s: %v", ledgerId, err)
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
