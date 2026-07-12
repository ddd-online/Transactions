package tool

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/Knetic/govaluate"
	"github.com/billadm/constant"
	"github.com/billadm/models"
	"github.com/billadm/models/dto"
	"github.com/billadm/service"
	"github.com/billadm/workspace"
)

// ---- context keys ----

type wsKey struct{}

func WithWorkspace(ctx context.Context, ws *workspace.Workspace) context.Context {
	return context.WithValue(ctx, wsKey{}, ws)
}

func getWS(ctx context.Context) (*workspace.Workspace, error) {
	ws, ok := ctx.Value(wsKey{}).(*workspace.Workspace)
	if !ok || ws == nil {
		return nil, fmt.Errorf("workspace not found in context")
	}
	return ws, nil
}

type ledgerNameKey struct{}

// WithLedgerName 将当前账本名称注入 context，供工具执行时使用。
func WithLedgerName(ctx context.Context, ledgerName string) context.Context {
	return context.WithValue(ctx, ledgerNameKey{}, ledgerName)
}

func getLedgerName(ctx context.Context, args map[string]any) string {
	if name, _ := ctx.Value(ledgerNameKey{}).(string); name != "" {
		return name
	}
	return getStringArg(args, "ledger_name")
}

// resolveLedgerID 根据账本名称解析 ledger ID。
// 优先使用 args 中的 ledger_name，其次使用 context 中注入的当前账本名。
func resolveLedgerID(ctx context.Context, args map[string]any, ledgerSvc service.LedgerService) (string, error) {
	name := getLedgerName(ctx, args)
	if name == "" {
		return "", fmt.Errorf("ledger_name is required: pass it as an argument or set the current ledger")
	}
	ws, err := getWS(ctx)
	if err != nil {
		return "", err
	}
	ledger, err := ledgerSvc.QueryLedgerByName(ws, name)
	if err != nil {
		return "", fmt.Errorf("未找到账本 %q", name)
	}
	return ledger.ID, nil
}

// resolvePeriod 将 period 参数转换为日期范围（start_date, end_date）。
// 如果传了 start_date/end_date，直接使用；否则按 period 计算；都未传则默认 last_30_days。
func resolvePeriod(args map[string]any) (string, string) {
	start := getStringArg(args, "start_date")
	end := getStringArg(args, "end_date")
	if start != "" && end != "" {
		return start, end
	}

	now := time.Now()
	period := getStringArg(args, "period")
	if period == "" {
		period = "last_30_days"
	}

	switch period {
	case "today":
		today := now.Format("2006-01-02")
		return today, today
	case "this_week":
		weekday := now.Weekday()
		var offset int
		if weekday == time.Sunday {
			offset = 6
		} else {
			offset = int(weekday) - 1
		}
		monday := now.AddDate(0, 0, -offset)
		return monday.Format("2006-01-02"), now.Format("2006-01-02")
	case "this_month":
		firstDay := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		return firstDay.Format("2006-01-02"), now.Format("2006-01-02")
	case "last_month":
		firstDay := time.Date(now.Year(), now.Month()-1, 1, 0, 0, 0, 0, now.Location())
		lastDay := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Add(-time.Second)
		return firstDay.Format("2006-01-02"), lastDay.Format("2006-01-02")
	case "this_year":
		firstDay := time.Date(now.Year(), 1, 1, 0, 0, 0, 0, now.Location())
		return firstDay.Format("2006-01-02"), now.Format("2006-01-02")
	case "last_30_days":
		return now.AddDate(0, 0, -30).Format("2006-01-02"), now.Format("2006-01-02")
	default:
		return now.AddDate(0, 0, -30).Format("2006-01-02"), now.Format("2006-01-02")
	}
}

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

type queryTransactionsTool struct {
	trSvc     service.TransactionRecordService
	ledgerSvc service.LedgerService
}

func NewQueryTransactionsTool(trSvc service.TransactionRecordService, ledgerSvc service.LedgerService) Tool {
	return &queryTransactionsTool{trSvc: trSvc, ledgerSvc: ledgerSvc}
}

func (t *queryTransactionsTool) Name() string { return "query_transactions" }
func (t *queryTransactionsTool) Description() string {
	return "查询交易记录。支持按时间范围（period 或 start_date/end_date）、交易类型、分类、标签、关键词筛选，支持分页。默认按日期倒序排列。"
}

func (t *queryTransactionsTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"ledger_name": map[string]any{"type": "string", "description": "账本名称（可选，默认使用当前选中账本）"},
			"period":      map[string]any{"type": "string", "description": "便捷时间范围: today/this_week/this_month/last_month/this_year/last_30_days。与 start_date/end_date 互斥，默认 last_30_days"},
			"start_date":  map[string]any{"type": "string", "description": "开始日期 YYYY-MM-DD（与 period 互斥）"},
			"end_date":    map[string]any{"type": "string", "description": "结束日期 YYYY-MM-DD（与 period 互斥）"},
			"type":        map[string]any{"type": "string", "description": "交易类型: expense/income/transfer"},
			"category":    map[string]any{"type": "string", "description": "分类名称"},
			"keyword":     map[string]any{"type": "string", "description": "关键词搜索（匹配描述）"},
			"tags":        map[string]any{"type": "array", "items": map[string]any{"type": "string"}, "description": "标签名称列表"},
			"tag_policy":  map[string]any{"type": "string", "description": "标签匹配策略: any（满足任一标签）/ all（满足所有标签），默认 any"},
			"page":        map[string]any{"type": "integer", "description": "页码，从 1 开始，默认 1"},
			"page_size":   map[string]any{"type": "integer", "description": "每页条数，默认 20，最大 50"},
		},
	}
}

func (t *queryTransactionsTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ledgerID, err := resolveLedgerID(ctx, args, t.ledgerSvc)
	if err != nil {
		return "", err
	}

	start, end := resolvePeriod(args)
	tsRange, err := parseDateRange(start, end)
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

	item := dto.QueryConditionItem{
		TransactionType: getStringArg(args, "type"),
		Category:        getStringArg(args, "category"),
		Description:     getStringArg(args, "keyword"),
	}
	// tags
	if tagsRaw, ok := args["tags"].([]any); ok {
		for _, v := range tagsRaw {
			if s, ok := v.(string); ok {
				item.Tags = append(item.Tags, s)
			}
		}
	}
	// tag_policy
	if tp := getStringArg(args, "tag_policy"); tp != "" {
		item.TagPolicy = tp
	} else {
		item.TagPolicy = "any"
	}

	if item.TransactionType != "" || item.Category != "" || item.Description != "" || len(item.Tags) > 0 {
		condition.Items = append(condition.Items, item)
	}

	ws, err := getWS(ctx)
	if err != nil {
		return "", err
	}
	result, err := t.trSvc.QueryTrsOnCondition(ws, condition)
	if err != nil {
		return "", err
	}

	b, _ := json.Marshal(result)
	return string(b), nil
}

// ---- 2. list_ledgers ----

type listLedgersTool struct {
	ledgerSvc service.LedgerService
}

func NewListLedgersTool(ledgerSvc service.LedgerService) Tool {
	return &listLedgersTool{ledgerSvc: ledgerSvc}
}

func (t *listLedgersTool) Name() string        { return "list_ledgers" }
func (t *listLedgersTool) Description() string { return "列出当前工作空间的所有账本" }

func (t *listLedgersTool) InputSchema() map[string]any {
	return map[string]any{
		"type":       "object",
		"properties": map[string]any{},
	}
}

func (t *listLedgersTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws, err := getWS(ctx)
	if err != nil {
		return "", err
	}
	ledgers, err := t.ledgerSvc.ListAllLedger(ws)
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

type listCategoriesTool struct {
	categorySvc service.CategoryService
	ledgerSvc   service.LedgerService
}

func NewListCategoriesTool(categorySvc service.CategoryService, ledgerSvc service.LedgerService) Tool {
	return &listCategoriesTool{categorySvc: categorySvc, ledgerSvc: ledgerSvc}
}

func (t *listCategoriesTool) Name() string        { return "list_categories" }
func (t *listCategoriesTool) Description() string { return "列出分类。可按交易类型筛选。" }

func (t *listCategoriesTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"ledger_name":      map[string]any{"type": "string", "description": "账本名称（可选，默认使用当前选中账本）"},
			"transaction_type": map[string]any{"type": "string", "description": "交易类型: expense/income/transfer，不传返回全部"},
		},
	}
}

func (t *listCategoriesTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ledgerID, err := resolveLedgerID(ctx, args, t.ledgerSvc)
	if err != nil {
		return "", err
	}

	trType := getStringArg(args, "transaction_type")
	if trType == "" {
		trType = constant.All
	}

	ws, err := getWS(ctx)
	if err != nil {
		return "", err
	}
	cats, err := t.categorySvc.QueryCategory(ws, ledgerID, trType)
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(cats)
	return string(b), nil
}

// ---- 4. list_tags ----

type listTagsTool struct {
	tagSvc    service.TagService
	ledgerSvc service.LedgerService
}

func NewListTagsTool(tagSvc service.TagService, ledgerSvc service.LedgerService) Tool {
	return &listTagsTool{tagSvc: tagSvc, ledgerSvc: ledgerSvc}
}

func (t *listTagsTool) Name() string        { return "list_tags" }
func (t *listTagsTool) Description() string { return "列出标签。可按分类和交易类型筛选。" }

func (t *listTagsTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"ledger_name":      map[string]any{"type": "string", "description": "账本名称（可选，默认使用当前选中账本）"},
			"category":         map[string]any{"type": "string", "description": "分类名称"},
			"transaction_type": map[string]any{"type": "string", "description": "交易类型"},
		},
	}
}

func (t *listTagsTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ledgerID, err := resolveLedgerID(ctx, args, t.ledgerSvc)
	if err != nil {
		return "", err
	}

	category := getStringArg(args, "category")
	trType := getStringArg(args, "transaction_type")

	var catTrType string
	if category != "" && trType != "" {
		catTrType = category + ":" + trType
	} else {
		catTrType = constant.All
	}

	ws, err := getWS(ctx)
	if err != nil {
		return "", err
	}
	tags, err := t.tagSvc.QueryTags(ws, ledgerID, catTrType)
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(tags)
	return string(b), nil
}

// ---- 5. get_key_events ----

type getKeyEventsTool struct {
	keyEventSvc service.KeyEventService
	ledgerSvc   service.LedgerService
}

func NewGetKeyEventsTool(keyEventSvc service.KeyEventService, ledgerSvc service.LedgerService) Tool {
	return &getKeyEventsTool{keyEventSvc: keyEventSvc, ledgerSvc: ledgerSvc}
}

func (t *getKeyEventsTool) Name() string        { return "get_key_events" }
func (t *getKeyEventsTool) Description() string { return "查询指定年份的关键事件（人生里程碑）。" }

func (t *getKeyEventsTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"ledger_name": map[string]any{"type": "string", "description": "账本名称（可选，默认使用当前选中账本）"},
			"year":        map[string]any{"type": "integer", "description": "年份，如 2026"},
		},
		"required": []string{"year"},
	}
}

func (t *getKeyEventsTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ledgerID, err := resolveLedgerID(ctx, args, t.ledgerSvc)
	if err != nil {
		return "", err
	}

	ws, err := getWS(ctx)
	if err != nil {
		return "", err
	}
	year := fmt.Sprintf("%d", int(getFloatArg(args, "year")))
	events, err := t.keyEventSvc.QueryByYear(ws, ledgerID, year)
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(events)
	return string(b), nil
}

// ---- 6. get_time ----

type getTimeTool struct{}

func NewGetTimeTool() Tool {
	return &getTimeTool{}
}

func (t *getTimeTool) Name() string { return "get_time" }
func (t *getTimeTool) Description() string {
	return "获取时间。不传参数时返回当前时间；传入 timestamp（Unix 时间戳，自动识别秒或毫秒）时解析为 YYYY-MM-DD HH:MM:SS 格式。"
}

func (t *getTimeTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"timestamp": map[string]any{
				"type":        "number",
				"description": "Unix 时间戳（秒或毫秒），可选。不传则返回当前时间。",
			},
		},
	}
}

func (t *getTimeTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	var datetime string

	ts := getFloatArg(args, "timestamp")
	if ts == 0 {
		// 无参数：返回当前本地时间
		datetime = time.Now().Format("2006-01-02 15:04:05")
	} else {
		// 传时间戳：自动识别秒或毫秒
		var sec int64
		if ts >= 1e12 {
			sec = int64(ts) / 1000
		} else {
			sec = int64(ts)
		}

		// 校验时间戳合法性
		if sec < 0 {
			return "", fmt.Errorf("无效的时间戳: %v，时间戳不能为负数", ts)
		}

		t := time.Unix(sec, 0).Local()
		datetime = t.Format("2006-01-02 15:04:05")
	}

	result := map[string]any{
		"datetime": datetime,
	}
	b, _ := json.Marshal(result)
	return string(b), nil
}

// ---- 7. calculate ----

type calculateTool struct{}

func NewCalculateTool() Tool {
	return &calculateTool{}
}

func (t *calculateTool) Name() string { return "calculate" }
func (t *calculateTool) Description() string {
	return "对数学表达式求值，支持四则运算（+ - * /）和括号。例如表达式 \"(100 + 200) * 3 / 5\" 返回 {\"result\": 180.00}。结果保留两位小数。"
}

func (t *calculateTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"expression": map[string]any{
				"type":        "string",
				"description": "数学表达式，如 \"100 + 200 * 3\" 或 \"(100 + 200) / 5\"",
			},
		},
		"required": []string{"expression"},
	}
}

func (t *calculateTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	expr, err := govaluate.NewEvaluableExpression(getStringArg(args, "expression"))
	if err != nil {
		return fmt.Sprintf(`{"error": "表达式语法错误: %s"}`, err.Error()), nil
	}

	result, err := expr.Evaluate(nil)
	if err != nil {
		return fmt.Sprintf(`{"error": "计算错误: %s"}`, err.Error()), nil
	}

	// Convert result to float64 and format to 2 decimal places
	var num float64
	switch v := result.(type) {
	case float64:
		num = v
	case int:
		num = float64(v)
	case int64:
		num = float64(v)
	default:
		return fmt.Sprintf(`{"error": "不支持的结果类型: %T"}`, result), nil
	}

	output := map[string]any{
		"result": fmt.Sprintf("%.2f", num),
	}
	b, _ := json.Marshal(output)
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

// moodKeywordToEmoji 将 LLM 使用的英文心情关键词转换为前端存储的 emoji。
var moodKeywordToEmoji = map[string]string{
	"happy":   "😊",
	"neutral": "😐",
	"sad":     "😢",
	"angry":   "😤",
	"anxious": "😰",
}

// convertMoodKeyword 将心情关键词转为 emoji，未知/空值返回原值。
func convertMoodKeyword(mood string) string {
	if emoji, ok := moodKeywordToEmoji[mood]; ok {
		return emoji
	}
	return mood
}

// ---- 8. query_diary ----

type queryDiaryTool struct {
	diarySvc service.DiaryService
}

func NewQueryDiaryTool(diarySvc service.DiaryService) Tool {
	return &queryDiaryTool{diarySvc: diarySvc}
}

func (t *queryDiaryTool) Name() string        { return "query_diary" }
func (t *queryDiaryTool) Description() string { return "查询日记。可按日期、关键词、年份、心情查询。不传参数返回最近日记日期列表。" }

func (t *queryDiaryTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"date":    map[string]any{"type": "string", "description": "具体日期 YYYY-MM-DD"},
			"keyword": map[string]any{"type": "string", "description": "关键词搜索（匹配正文内容）"},
			"year":    map[string]any{"type": "integer", "description": "年份，如 2026"},
			"mood":    map[string]any{"type": "string", "description": "心情筛选，可选值: happy(开心) / neutral(平静) / sad(难过) / angry(生气) / anxious(焦虑)"},
		},
	}
}

func (t *queryDiaryTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws, err := getWS(ctx)
	if err != nil {
		return "", err
	}

	if date := getStringArg(args, "date"); date != "" {
		entry, err := t.diarySvc.GetByDate(ws, date)
		if err != nil {
			return "", err
		}
		b, _ := json.Marshal(entry)
		return string(b), nil
	}

	items, err := t.diarySvc.ListDates(ws)
	if err != nil {
		return "", err
	}

	if keyword := getStringArg(args, "keyword"); keyword != "" {
		var filtered []models.DiaryDateItem
		for _, item := range items {
			entry, err := t.diarySvc.GetByDate(ws, item.Date)
			if err != nil {
				continue
			}
			if strings.Contains(entry.Content, keyword) {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}

	if year := getIntArg(args, "year", 0); year > 0 {
		var filtered []models.DiaryDateItem
		for _, item := range items {
			if strings.HasPrefix(item.Date, fmt.Sprintf("%d-", year)) {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}

	if mood := convertMoodKeyword(getStringArg(args, "mood")); mood != "" {
		var filtered []models.DiaryDateItem
		for _, item := range items {
			if item.Mood == mood {
				filtered = append(filtered, item)
			}
		}
		items = filtered
	}

	b, _ := json.Marshal(items)
	return string(b), nil
}

// ---- 9. write_diary ----

type writeDiaryTool struct {
	diarySvc service.DiaryService
}

func NewWriteDiaryTool(diarySvc service.DiaryService) Tool {
	return &writeDiaryTool{diarySvc: diarySvc}
}

func (t *writeDiaryTool) Name() string        { return "write_diary" }
func (t *writeDiaryTool) Description() string { return "创建或更新指定日期的日记。如果该日期已有日记则覆盖内容。" }

func (t *writeDiaryTool) InputSchema() map[string]any {
	return map[string]any{
		"type": "object",
		"properties": map[string]any{
			"date":    map[string]any{"type": "string", "description": "日期 YYYY-MM-DD（必填）"},
			"content": map[string]any{"type": "string", "description": "日记正文，支持 Markdown（必填）"},
			"mood":    map[string]any{"type": "string", "description": "心情，可选值: happy(开心) / neutral(平静) / sad(难过) / angry(生气) / anxious(焦虑)，不传表示无"},
		},
		"required": []string{"date", "content"},
	}
}

func (t *writeDiaryTool) Execute(ctx context.Context, args map[string]any) (string, error) {
	ws, err := getWS(ctx)
	if err != nil {
		return "", err
	}
	date := getStringArg(args, "date")
	content := getStringArg(args, "content")
	mood := convertMoodKeyword(getStringArg(args, "mood"))

	entry, err := t.diarySvc.Upsert(ws, date, content, mood)
	if err != nil {
		return "", err
	}
	b, _ := json.Marshal(map[string]any{
		"date":       entry.Date,
		"word_count": entry.WordCount,
		"mood":       entry.Mood,
		"message":    "日记已保存",
	})
	return string(b), nil
}
