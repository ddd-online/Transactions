package tool

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/billadm/constant"
	"github.com/billadm/models/dto"
	"github.com/billadm/service"
	"github.com/billadm/workspace"
)

// ---- context keys ----

type wsKey struct{}

func WithWorkspace(ctx context.Context, ws *workspace.Workspace) context.Context {
	return context.WithValue(ctx, wsKey{}, ws)
}

func getWS(ctx context.Context) *workspace.Workspace {
	return ctx.Value(wsKey{}).(*workspace.Workspace)
}

type ledgerIDKey struct{}

// WithLedgerID injects the current ledger ID into the context.
// ChatService uses this before invoking tool Execute so tools don't
// need to receive ledger_id as an explicit argument.
func WithLedgerID(ctx context.Context, ledgerID string) context.Context {
	return context.WithValue(ctx, ledgerIDKey{}, ledgerID)
}

// getLedgerID returns ledger ID first from context (injected by ChatService),
// then falls back to the "ledger_id" argument passed by the AI model.
func getLedgerID(ctx context.Context, args map[string]any) string {
	if id, _ := ctx.Value(ledgerIDKey{}).(string); id != "" {
		return id
	}
	return getStringArg(args, "ledger_id")
}

// requireLedgerID is like getLedgerID but returns an error when neither
// source provides a ledger ID.
func requireLedgerID(ctx context.Context, args map[string]any) (string, error) {
	id := getLedgerID(ctx, args)
	if id == "" {
		return "", fmt.Errorf("ledger_id is required: pass it as an argument or inject via WithLedgerID")
	}
	return id, nil
}

// parseDateRange converts two "YYYY-MM-DD" date strings to a []int64 Unix
// timestamp range. The end date is set to the last second of that day.
func parseDateRange(start, end string) ([]int64, error) {
	if start == "" || end == "" {
		return nil, fmt.Errorf("start_date and end_date are required")
	}
	startT, err := time.ParseInLocation("2006-01-02", start, time.Local)
	if err != nil {
		return nil, fmt.Errorf("invalid start_date %q: %w", start, err)
	}
	endT, err := time.ParseInLocation("2006-01-02", end, time.Local)
	if err != nil {
		return nil, fmt.Errorf("invalid end_date %q: %w", end, err)
	}
	endT = endT.Add(24*time.Hour - time.Second)
	return []int64{startT.Unix(), endT.Unix()}, nil
}

// ---- 1. query_transactions ----

type queryTransactionsTool struct{}

func NewQueryTransactionsTool() Tool { return &queryTransactionsTool{} }

func (t *queryTransactionsTool) Name() string { return "query_transactions" }
func (t *queryTransactionsTool) Description() string {
	return "查询交易记录。可按日期范围、交易类型(expense/income/transfer)、分类、标签、关键词筛选，支持排序和分页。"
}

func (t *queryTransactionsTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"ledger_id":   map[string]any{"type": "string", "description": "账本ID（必填）"},
			"start_date":  map[string]any{"type": "string", "description": "开始日期，格式 YYYY-MM-DD"},
			"end_date":    map[string]any{"type": "string", "description": "结束日期，格式 YYYY-MM-DD"},
			"type":        map[string]any{"type": "string", "description": "交易类型: expense/income/transfer"},
			"category":    map[string]any{"type": "string", "description": "分类名称"},
			"keyword":     map[string]any{"type": "string", "description": "关键词搜索（匹配描述）"},
			"sort_field":  map[string]any{"type": "string", "description": "排序字段，默认 transactionAt"},
			"sort_order":  map[string]any{"type": "string", "description": "排序方向: asc/desc，默认 desc"},
			"page":        map[string]any{"type": "integer", "description": "页码，从 1 开始，默认 1"},
			"page_size":   map[string]any{"type": "integer", "description": "每页条数，默认 20，最大 50"},
		},
		"required": []string{"ledger_id", "start_date", "end_date"},
	}
}

func (t *queryTransactionsTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws := getWS(ctx)
	ledgerID, err := requireLedgerID(ctx, args)
	if err != nil {
		return "", err
	}

	tsRange, err := parseDateRange(getStringArg(args, "start_date"), getStringArg(args, "end_date"))
	if err != nil {
		return "", err
	}

	page := getIntArg(args, "page", 1)
	pageSize := getIntArg(args, "page_size", 20)
	if pageSize > 50 {
		pageSize = 50
	}

	condition := &dto.TrQueryCondition{
		LedgerID: ledgerID,
		TsRange:  tsRange,
		Offset:   (page - 1) * pageSize,
		Limit:    pageSize,
	}

	// Build a single QueryConditionItem if any filter field is set.
	item := dto.QueryConditionItem{
		TransactionType: getStringArg(args, "type"),
		Category:        getStringArg(args, "category"),
		Description:     getStringArg(args, "keyword"),
	}
	if item.TransactionType != "" || item.Category != "" || item.Description != "" {
		condition.Items = append(condition.Items, item)
	}

	// Sort: convert simple strings to SortFields slice.
	if sf := getStringArg(args, "sort_field"); sf != "" {
		order := getStringArg(args, "sort_order")
		if order == "" {
			order = "desc"
		}
		condition.SortFields = append(condition.SortFields, dto.QueryConditionSortField{
			Field: sf,
			Order: order,
		})
	}

	result, err := service.GetTrService().QueryTrsOnCondition(ws, condition)
	if err != nil {
		return "", err
	}

	b, _ := json.Marshal(result)
	return string(b), nil
}

// ---- 2. list_ledgers ----

type listLedgersTool struct{}

func NewListLedgersTool() Tool { return &listLedgersTool{} }

func (t *listLedgersTool) Name() string        { return "list_ledgers" }
func (t *listLedgersTool) Description() string { return "列出当前工作空间的所有账本" }

func (t *listLedgersTool) InputSchema() map[string]any {
	return map[string]any{
		"type":       "object",
		"properties": map[string]any{},
	}
}

func (t *listLedgersTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws := getWS(ctx)
	ledgers, err := service.GetLedgerService().ListAllLedger(ws)
	if err != nil {
		return "", err
	}
	type simple struct {
		ID   string `json:"id"`
		Name string `json:"name"`
	}
	list := make([]simple, 0, len(ledgers))
	for _, l := range ledgers {
		list = append(list, simple{ID: l.ID, Name: l.Name})
	}
	b, _ := json.Marshal(list)
	return string(b), nil
}

// ---- 3. list_categories ----

type listCategoriesTool struct{}

func NewListCategoriesTool() Tool { return &listCategoriesTool{} }

func (t *listCategoriesTool) Name() string        { return "list_categories" }
func (t *listCategoriesTool) Description() string { return "列出分类。可按交易类型筛选。" }

func (t *listCategoriesTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"ledger_id":        map[string]any{"type": "string", "description": "账本ID（必填）"},
			"transaction_type": map[string]any{"type": "string", "description": "交易类型: expense/income/transfer，不传返回全部"},
		},
		"required": []string{"ledger_id"},
	}
}

func (t *listCategoriesTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws := getWS(ctx)
	ledgerID, err := requireLedgerID(ctx, args)
	if err != nil {
		return "", err
	}

	trType := getStringArg(args, "transaction_type")
	if trType == "" {
		trType = constant.All
	}

	cats, err := service.GetCategoryService().QueryCategory(ws, ledgerID, trType)
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(cats)
	return string(b), nil
}

// ---- 4. list_tags ----

type listTagsTool struct{}

func NewListTagsTool() Tool { return &listTagsTool{} }

func (t *listTagsTool) Name() string        { return "list_tags" }
func (t *listTagsTool) Description() string { return "列出标签。可按分类和交易类型筛选。" }

func (t *listTagsTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"ledger_id":        map[string]any{"type": "string", "description": "账本ID（必填）"},
			"category":         map[string]any{"type": "string", "description": "分类名称"},
			"transaction_type": map[string]any{"type": "string", "description": "交易类型"},
		},
		"required": []string{"ledger_id"},
	}
}

func (t *listTagsTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws := getWS(ctx)
	ledgerID, err := requireLedgerID(ctx, args)
	if err != nil {
		return "", err
	}

	category := getStringArg(args, "category")
	trType := getStringArg(args, "transaction_type")

	// Compose categoryTransactionType for service call.
	// Format is "categoryName:transactionType", or constant.All for everything.
	var catTrType string
	if category != "" && trType != "" {
		catTrType = category + ":" + trType
	} else {
		catTrType = constant.All
	}

	tags, err := service.GetTagService().QueryTags(ws, ledgerID, catTrType)
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(tags)
	return string(b), nil
}

// ---- 5. query_chart_data ----

type queryChartDataTool struct{}

func NewQueryChartDataTool() Tool { return &queryChartDataTool{} }

func (t *queryChartDataTool) Name() string        { return "query_chart_data" }
func (t *queryChartDataTool) Description() string { return "查询图表统计数据。返回按交易类型分组的交易记录，前端可按时间聚合。支持年/月粒度。" }

func (t *queryChartDataTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"ledger_id":   map[string]any{"type": "string", "description": "账本ID（必填）"},
			"granularity": map[string]any{"type": "string", "description": "时间粒度: year 或 month，默认 month"},
			"start_date":  map[string]any{"type": "string", "description": "开始日期 YYYY-MM-DD"},
			"end_date":    map[string]any{"type": "string", "description": "结束日期 YYYY-MM-DD"},
			"types":       map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "交易类型列表，默认包含 expense/income/transfer"},
		},
		"required": []string{"ledger_id", "start_date", "end_date"},
	}
}

func (t *queryChartDataTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws := getWS(ctx)
	ledgerID, err := requireLedgerID(ctx, args)
	if err != nil {
		return "", err
	}

	tsRange, err := parseDateRange(getStringArg(args, "start_date"), getStringArg(args, "end_date"))
	if err != nil {
		return "", err
	}

	granularity := getStringArg(args, "granularity")
	if granularity == "" {
		granularity = "month"
	}

	// Build chart lines from the "types" argument.
	var types []string
	if typesRaw, ok := args["types"].([]any); ok {
		for _, v := range typesRaw {
			if s, ok := v.(string); ok {
				types = append(types, s)
			}
		}
	}
	if len(types) == 0 {
		types = []string{constant.TransactionTypeExpense, constant.TransactionTypeIncome, constant.TransactionTypeTransfer}
	}

	lines := make([]dto.ChartLineCondition, 0, len(types))
	for _, tt := range types {
		lines = append(lines, dto.ChartLineCondition{
			Label:           tt,
			TransactionType: tt,
			IncludeOutlier:  true,
		})
	}

	req := &dto.ChartQueryRequest{
		LedgerID:    ledgerID,
		TsRange:     tsRange,
		Granularity: granularity,
		Lines:       lines,
	}

	result, err := service.GetTrService().QueryTrsForChart(ws, req)
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(result)
	return string(b), nil
}

// ---- 6. get_key_events ----

type getKeyEventsTool struct{}

func NewGetKeyEventsTool() Tool { return &getKeyEventsTool{} }

func (t *getKeyEventsTool) Name() string        { return "get_key_events" }
func (t *getKeyEventsTool) Description() string { return "查询指定年份的关键事件（人生里程碑）。" }

func (t *getKeyEventsTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"ledger_id": map[string]any{"type": "string", "description": "账本ID（必填）"},
			"year":      map[string]any{"type": "integer", "description": "年份，如 2026"},
		},
		"required": []string{"ledger_id", "year"},
	}
}

func (t *getKeyEventsTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws := getWS(ctx)
	ledgerID, err := requireLedgerID(ctx, args)
	if err != nil {
		return "", err
	}

	year := fmt.Sprintf("%d", int(getFloatArg(args, "year")))
	events, err := service.GetKeyEventService().QueryByYear(ws, ledgerID, year)
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(events)
	return string(b), nil
}

// ---- helper functions ----

func getStringArg(args map[string]any, key string) string {
	if v, ok := args[key].(string); ok {
		return v
	}
	return ""
}

func getIntArg(args map[string]any, key string, defaultVal int) int {
	switch v := args[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	}
	return defaultVal
}

func getFloatArg(args map[string]any, key string) float64 {
	if v, ok := args[key].(float64); ok {
		return v
	}
	return 0
}
