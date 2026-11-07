import type { CategoryDto } from '../../shared/types/category'

/** 图表编辑器与图表页共用的选项：一处定义，两处读。 */
export const CHART_TYPES = [
  { value: 'line', label: '折线图' },
  { value: 'pie', label: '饼图' },
]

/** 饼图的分组字段：分类（一次一种交易类型）、标签，或交易类型。 */
export const GROUP_FIELDS = [
  { value: 'category', label: '分类' },
  { value: 'tag', label: '标签' },
  { value: 'transactionType', label: '交易类型' },
]

export const GRANULARITIES = [
  { value: 'month', label: '月' },
  { value: 'year', label: '年' },
]

export const LINE_TYPES = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
]

export const TAG_POLICIES = [
  { value: 'any', label: '任意' },
  { value: 'all', label: '全部' },
]

/** 某种交易类型下的分类名（去重，按出现顺序）。 */
export function categoryNamesFor(
  categories: readonly CategoryDto[],
  transactionType: string,
): string[] {
  const names = new Set<string>()
  for (const category of categories) {
    if (category.transactionType === transactionType) names.add(category.name)
  }
  return Array.from(names)
}

export function categoryOptionsFor(
  categories: readonly CategoryDto[],
  transactionType: string,
): Array<{ value: string; label: string }> {
  return categoryNamesFor(categories, transactionType).map((name) => ({ value: name, label: name }))
}
