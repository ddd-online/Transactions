package operator

import (
	"sort"
	"strings"

	"github.com/billadm/constant"
	"github.com/billadm/models/dto"
)

type TrOperator struct {
	trDtos []*dto.TransactionRecordDto
	offset int
	limit  int
}

func NewTrOperator() *TrOperator {
	return &TrOperator{
		trDtos: make([]*dto.TransactionRecordDto, 0),
	}
}

func (t *TrOperator) Add(trDtos []*dto.TransactionRecordDto) *TrOperator {
	t.trDtos = append(t.trDtos, trDtos...)
	return t
}

func (t *TrOperator) Filter(items []dto.QueryConditionItem) *TrOperator {
	if len(items) == 0 {
		return t // 无条件，不过滤
	}

	var filtered []*dto.TransactionRecordDto

	for _, tr := range t.trDtos {
		matched := false

		// 多个 QueryConditionItem 是 OR 关系
		for _, cond := range items {
			if t.matchCondition(tr, cond) {
				matched = true
				break
			}
		}

		if matched {
			filtered = append(filtered, tr)
		}
	}

	t.trDtos = filtered
	return t
}

// matchCondition 判断单条记录是否匹配一个 QueryConditionItem（内部字段为 AND 关系）
func (t *TrOperator) matchCondition(tr *dto.TransactionRecordDto, cond dto.QueryConditionItem) bool {
	// TransactionType
	if cond.TransactionType != "" && tr.TransactionType != cond.TransactionType {
		return false
	}

	// Category
	if cond.Category != "" && tr.Category != cond.Category {
		return false
	}

	// Description（模糊包含）
	if cond.Description != "" && !strings.Contains(tr.Description, cond.Description) {
		return false
	}

	// Tags
	if len(cond.Tags) > 0 {
		tagMatch := t.matchTags(tr.Tags, cond.Tags, cond.TagPolicy)
		if cond.TagNot {
			tagMatch = !tagMatch
		}
		if !tagMatch {
			return false
		}
	}

	return true
}

// matchTags 根据策略判断记录的 tags 是否匹配条件 tags
func (t *TrOperator) matchTags(recordTags, condTags []string, policy string) bool {
	if len(recordTags) == 0 {
		return false
	}

	recordTagSet := make(map[string]bool)
	for _, tag := range recordTags {
		recordTagSet[tag] = true
	}

	switch policy {
	case "all":
		// 必须包含所有 condTags
		for _, tag := range condTags {
			if !recordTagSet[tag] {
				return false
			}
		}
		return true
	case "any", "":
		// 包含任意一个即可
		for _, tag := range condTags {
			if recordTagSet[tag] {
				return true
			}
		}
		return false
	default:
		// 未知策略，默认按 "any" 处理
		for _, tag := range condTags {
			if recordTagSet[tag] {
				return true
			}
		}
		return false
	}
}

func (t *TrOperator) Sort(sortFields []SortField) *TrOperator {
	if len(sortFields) == 0 || len(t.trDtos) <= 1 {
		return t
	}

	toSort := sortableTrDtos{
		data:       t.trDtos,
		sortFields: sortFields,
	}

	sort.Sort(toSort)

	t.trDtos = toSort.data
	return t
}

func (t *TrOperator) Page(offset, limit int) *TrOperator {
	if offset < 0 {
		offset = 0
	}
	if limit < 0 {
		limit = 0
	}
	t.offset = offset
	t.limit = limit
	return t
}

func (t *TrOperator) Summary() *dto.TrQueryResult {
	total := int64(len(t.trDtos))

	// 初始化 trStatistics
	trStatistics := map[string]int64{
		constant.TransactionTypeIncome:   0,
		constant.TransactionTypeExpense:  0,
		constant.TransactionTypeTransfer: 0,
	}

	// 遍历所有记录（分页前）进行金额汇总
	for _, tr := range t.trDtos {
		switch tr.TransactionType {
		case constant.TransactionTypeIncome, constant.TransactionTypeExpense, constant.TransactionTypeTransfer:
			trStatistics[tr.TransactionType] += tr.Price
		default:
			// 可选：忽略未知类型，或归入其他
		}
	}

	// 执行分页
	var items []*dto.TransactionRecordDto
	pageSize := t.limit
	page := 1
	totalPages := 1

	if t.limit == 0 {
		// limit=0 表示不分页（或取全部）
		items = t.trDtos
		pageSize = len(t.trDtos)
	} else {
		start := t.offset
		end := t.offset + t.limit

		if start > len(t.trDtos) {
			start = len(t.trDtos)
		}
		if end > len(t.trDtos) {
			end = len(t.trDtos)
		}
		if start < end {
			items = t.trDtos[start:end]
		} else {
			items = []*dto.TransactionRecordDto{}
		}

		page = (t.offset / t.limit) + 1
		totalPages = (int(total) + t.limit - 1) / t.limit
	}

	return &dto.TrQueryResult{
		Items:        items,
		Total:        total,
		Page:         page,
		PageSize:     pageSize,
		TotalPages:   totalPages,
		TrStatistics: trStatistics,
	}
}
