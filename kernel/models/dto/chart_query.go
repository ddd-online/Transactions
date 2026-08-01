package dto

type ChartLineCondition struct {
	Label          string               `json:"label"`
	TransactionType string             `json:"transactionType"`
	IncludeOutlier bool                `json:"includeOutlier"`
	Conditions     []QueryConditionItem `json:"conditions"`
}

type ChartQueryRequest struct {
	LedgerID    string               `json:"ledgerId"`
	TsRange     []int64            `json:"tsRange"`
	Granularity string               `json:"granularity"` // "year" or "month"
	Lines       []ChartLineCondition `json:"lines"`
}

// ChartPoint 是聚合后的单个时间序列点。
type ChartPoint struct {
	Time   string `json:"time"`
	Amount int64  `json:"amount"`
}

// ChartLineData 包含单条曲线的聚合序列数据。
type ChartLineData struct {
	Label string       `json:"label"`
	Type  string       `json:"type"`
	Data  []ChartPoint `json:"data"`
}

type ChartQueryResponse struct {
	Lines      []ChartLineData `json:"lines"`
	Statistics map[string]int64 `json:"statistics"`
}


