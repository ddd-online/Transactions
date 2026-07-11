package dto

type TrQueryResult struct {
	Items        []*TransactionRecordDto `json:"items"`
	Total        int64                   `json:"total"`
	Page         int                     `json:"page"`
	PageSize     int                     `json:"page_size"`
	TotalPages   int                     `json:"total_pages"`
	TrStatistics map[string]int64        `json:"trStatistics"`
}
