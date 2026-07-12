package dto

import (
	"github.com/billadm/models"
)

// Re-export ChartLine from models for convenience
type ChartLine = models.ChartLine

type ChartDto struct {
	ChartID     string     `json:"chartId"`
	LedgerID    string     `json:"ledgerId"`
	Title       string     `json:"title"`
	Granularity string     `json:"granularity"`
	Lines       []ChartLine `json:"lines"`
	ChartType   string     `json:"chartType"`
	IsPreset    bool       `json:"isPreset"`
	SortOrder   int        `json:"sortOrder"`
}

type CreateChartRequest struct {
	LedgerID    string     `json:"ledgerId"`
	Title       string     `json:"title"`
	Granularity string     `json:"granularity"`
	Lines       []ChartLine `json:"lines"`
	ChartType   string     `json:"chartType"`
}

type UpdateChartRequest struct {
	ChartID     string     `json:"chartId"`
	Title       string     `json:"title"`
	Granularity string     `json:"granularity"`
	Lines       []ChartLine `json:"lines"`
	ChartType   string     `json:"chartType"`
	SortOrder   int        `json:"sortOrder"`
}
