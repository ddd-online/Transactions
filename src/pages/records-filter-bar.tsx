/**
 * 记录页顶部的筛选条与它带的两张弹窗：时间范围、排序、筛选条件。
 *
 * 条件模型（{@link RecordFilter}）与列表摘要、查询项换算都跟着筛选条走；页面持有
 * 已提交 / 草稿两态并负责把条件拼进 `tr_query`，这里只渲染与回调。
 */

import { Input, Modal, Select } from 'antd'
import type { JSX } from 'react'

import { transactionTypeText } from '../../shared/domain/format'
import { tagNamesForFilter } from '../../shared/domain/tag-names'
import type { CategoryDto, TagDto } from '../../shared/types/category'
import type { QueryConditionSortField } from '../../shared/types/transaction'

import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { Segmented } from '../components/segmented'
import { TimeRangePicker, type TimeRangeMode } from '../components/time-range-picker'
import { categoryOptions, filterTagOptions, type DraftOption } from './record-draft'

/** 一条筛选条件（弹窗里编辑的那份草稿也是这个形状）。 */
export interface RecordFilter {
  transactionType: string
  category: string
  tags: string[]
  tagPolicy: string
  tagNot: boolean
  description: string
}

export function emptyFilter(): RecordFilter {
  return {
    transactionType: '',
    category: '',
    tags: [],
    tagPolicy: 'any',
    tagNot: false,
    description: '',
  }
}

export function filterHasContent(filter: RecordFilter): boolean {
  return Boolean(
    filter.transactionType || filter.category || filter.tags.length > 0 || filter.description.trim(),
  )
}

/**
 * 改分类 / 消费类型：标签候选跟着换，不属于新组合的已选标签一起摘掉。
 *
 * 与「记一笔」换分类时的处理同一条规则（`draftWithCategoryOrType`）—— 标签按
 * `分类:类型` 归档，留着别的组合的标签，这条条件永远查不到记录。分类与类型都不限时
 * 清单本来就是全部标签，没有可摘的。
 */
export function filterWithCategoryOrType(
  filter: RecordFilter,
  patch: Partial<RecordFilter>,
  tagRows: readonly Pick<TagDto, 'name' | 'categoryTransactionType'>[],
): RecordFilter {
  const next = { ...filter, ...patch }
  if (next.category.trim() === '' && next.transactionType === '') return next
  const valid = new Set(tagNamesForFilter(tagRows, next.category, next.transactionType))
  return { ...next, tags: next.tags.filter((tag) => valid.has(tag)) }
}

/** 条件列表里的一行摘要，例如：`收入 / 工资奖金 / 工资`。 */
export function filterSummary(filter: RecordFilter): string {
  const parts: string[] = []
  if (filter.transactionType) parts.push(transactionTypeText(filter.transactionType))
  if (filter.category) parts.push(filter.category)
  if (filter.tags.length > 0) parts.push(filter.tags.join('、'))
  if (filter.description.trim()) parts.push(`"${filter.description.trim()}"`)
  return parts.join(' / ')
}

export function toQueryItem(filter: RecordFilter) {
  return {
    transactionType: filter.transactionType,
    category: filter.category,
    tags: filter.tags,
    tagPolicy: filter.tags.length > 0 ? filter.tagPolicy : '',
    tagNot: filter.tags.length > 0 && filter.tagNot,
    description: filter.description.trim(),
  }
}

export const DEFAULT_SORT: QueryConditionSortField[] = [{ field: 'transactionAt', order: 'desc' }]

const SORT_FIELD_OPTIONS = [
  { value: 'transactionAt', label: '日期' },
  { value: 'transactionType', label: '类型' },
  { value: 'category', label: '分类' },
  { value: 'price', label: '金额' },
]

const SORT_ORDER_OPTIONS = [
  { value: 'desc', label: '降序' },
  { value: 'asc', label: '升序' },
]

const TYPE_OPTIONS = [
  { value: 'expense', label: '支出' },
  { value: 'income', label: '收入' },
  { value: 'transfer', label: '转账' },
]

/** 筛选里的类型多一个「全部」，对应 `transactionType: ''`（不限类型）。 */
const FILTER_TYPE_OPTIONS = [{ value: 'all', label: '全部' }, ...TYPE_OPTIONS]

export function nextSortField(fields: readonly QueryConditionSortField[]): string {
  const used = new Set(fields.map((field) => field.field))
  return SORT_FIELD_OPTIONS.find((option) => !used.has(option.value))?.value ?? 'transactionAt'
}

export interface RecordsFilterBarProps {
  rangeMode: TimeRangeMode
  rangeStart: string
  rangeEnd: string
  /** 「筛选」按钮上的条件数角标；0 不显示 */
  activeFilterCount: number
  onRangeModeChange: (mode: TimeRangeMode) => void
  onRangeChange: (start: string, end: string) => void
  onOpenSort: () => void
  onOpenFilter: () => void
  onCreate: () => void
}

/** 工具栏：时间范围 + 排序 / 筛选 / 记一笔。 */
export function RecordsFilterBar({
  rangeMode,
  rangeStart,
  rangeEnd,
  activeFilterCount,
  onRangeModeChange,
  onRangeChange,
  onOpenSort,
  onOpenFilter,
  onCreate,
}: RecordsFilterBarProps): JSX.Element {
  return (
    <>
      <div className="m0-actions">
        <TimeRangePicker
          testId="tr-time"
          mode={rangeMode}
          start={rangeStart}
          end={rangeEnd}
          onModeChange={onRangeModeChange}
          onRangeChange={onRangeChange}
        />
      </div>
      <div className="m0-actions">
        <Button
          variant="secondary"
          testId="tr-sort"
          icon={<Icon name="SortDesc" size={14} />}
          onClick={onOpenSort}
        >
          排序
        </Button>
        <Button
          variant="secondary"
          testId="tr-filter"
          icon={<Icon name="Filter" size={14} />}
          onClick={onOpenFilter}
        >
          筛选
          {activeFilterCount > 0 ? (
            <span className="tr-btn-badge">{activeFilterCount}</span>
          ) : null}
        </Button>
        <Button
          variant="primary"
          testId="tr-new"
          icon={<Icon name="Plus" size={14} />}
          onClick={onCreate}
        >
          记一笔
        </Button>
      </div>
    </>
  )
}

export interface RecordsFilterDialogsProps {
  sortOpen: boolean
  sortDraft: QueryConditionSortField[]
  onSortClose: () => void
  onSortChange: (index: number, patch: Partial<QueryConditionSortField>) => void
  onSortAdd: () => void
  onSortRemove: (index: number) => void
  onSortReset: () => void
  onSortApply: () => void

  filterOpen: boolean
  filterEditor: RecordFilter
  filterDraft: RecordFilter[]
  categories: CategoryDto[]
  tagRows: TagDto[]
  onFilterClose: () => void
  onFilterEditorChange: (patch: Partial<RecordFilter>) => void
  onFilterAdd: () => void
  onFilterRemove: (index: number) => void
  onFilterClear: () => void
  onFilterApply: () => void
}

/** 排序与筛选两张弹窗。 */
export function RecordsFilterDialogs({
  sortOpen,
  sortDraft,
  onSortClose,
  onSortChange,
  onSortAdd,
  onSortRemove,
  onSortReset,
  onSortApply,
  filterOpen,
  filterEditor,
  filterDraft,
  categories,
  tagRows,
  onFilterClose,
  onFilterEditorChange,
  onFilterAdd,
  onFilterRemove,
  onFilterClear,
  onFilterApply,
}: RecordsFilterDialogsProps): JSX.Element {
  // 标签候选跟着已选的分类 / 消费类型收窄：只列这个组合下真实存在的标签（筛选允许两端
  // 都不限，那就列全部）。
  const tagSelectOptions: DraftOption[] = filterTagOptions(
    tagRows,
    filterEditor.category,
    filterEditor.transactionType,
  )

  return (
    <>
      <Modal
        open={sortOpen}
        title="排序"
        width={520}
        centered
        destroyOnHidden
        footer={null}
        onCancel={onSortClose}
      >
        <div className="tr-sort">
          <div className="tr-sort__list">
            {sortDraft.map((field, index) => (
              <div className="tr-sort__item" key={`${field.field}-${index}`}>
                <span className="tr-sort__priority">{index + 1}</span>
                <Select
                  className="tr-sort__select tr-sort__select--field"
                  value={field.field}
                  onChange={(value: string) => onSortChange(index, { field: value })}
                  options={SORT_FIELD_OPTIONS}
                />
                <Select
                  className="tr-sort__select tr-sort__select--order"
                  value={field.order}
                  onChange={(value: string) => onSortChange(index, { order: value })}
                  options={SORT_ORDER_OPTIONS}
                />
                <Button
                  variant="text-danger"
                  size="sm"
                  aria-label="删除排序条件"
                  icon={<Icon name="Trash" size={14} />}
                  onClick={() => onSortRemove(index)}
                />
              </div>
            ))}
          </div>
          <Button variant="secondary" block icon={<Icon name="Plus" size={14} />} onClick={onSortAdd}>
            添加排序条件
          </Button>
          <div className="tr-sort__actions">
            <Button variant="secondary" onClick={onSortReset}>
              重置
            </Button>
            <Button variant="primary" testId="tr-sort-apply" onClick={onSortApply}>
              应用
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={filterOpen}
        title="筛选条件"
        width={640}
        centered
        destroyOnHidden
        footer={null}
        onCancel={onFilterClose}
      >
        <div className="tr-modal-form">
          <div className="tr-modal-field">
            <span className="tr-modal-label">消费类型</span>
            <Segmented
              ariaLabel="消费类型"
              testId="tr-filter-type"
              block
              value={filterEditor.transactionType || 'all'}
              onChange={(value: string) =>
                onFilterEditorChange({
                  transactionType: value === 'all' ? '' : value,
                  category: '',
                })
              }
              options={FILTER_TYPE_OPTIONS}
            />
          </div>

          <div className="tr-modal-row">
            <div className="tr-modal-field">
              <span className="tr-modal-label">分类</span>
              <Select
                aria-label="分类"
                data-testid="tr-filter-category"
                value={filterEditor.category || undefined}
                placeholder="选择消费分类"
                allowClear
                onChange={(value: string | undefined) => onFilterEditorChange({ category: value ?? '' })}
                options={categoryOptions(categories, filterEditor.transactionType)}
              />
            </div>

            <div className="tr-modal-field">
              <span className="tr-modal-label">标签</span>
              <Select
                aria-label="标签"
                data-testid="tr-filter-tags"
                mode="tags"
                allowClear
                placeholder="选择标签"
                value={filterEditor.tags}
                onChange={(value: string[]) => onFilterEditorChange({ tags: value })}
                options={tagSelectOptions}
              />
            </div>
          </div>

          <div className="tr-modal-row">
            <div className="tr-modal-field">
              <span className="tr-modal-label">标签匹配</span>
              <Select
                aria-label="标签匹配"
                data-testid="tr-filter-policy"
                value={filterEditor.tagPolicy}
                onChange={(value: string) => onFilterEditorChange({ tagPolicy: value })}
                options={[
                  { value: 'any', label: '任意' },
                  { value: 'all', label: '全部' },
                ]}
              />
            </div>

            <div className="tr-modal-field">
              <span className="tr-modal-label">标签取反</span>
              <Select
                aria-label="标签取反"
                data-testid="tr-filter-not"
                value={filterEditor.tagNot ? 'exclude' : 'include'}
                onChange={(value: string) => onFilterEditorChange({ tagNot: value === 'exclude' })}
                options={[
                  { value: 'include', label: '包含' },
                  { value: 'exclude', label: '不包含' },
                ]}
              />
            </div>
          </div>

          <div className="tr-modal-field">
            <span className="tr-modal-label">描述包含</span>
            <Input
              aria-label="描述包含"
              data-testid="tr-filter-description"
              placeholder="输入关键词"
              value={filterEditor.description}
              onChange={(event) => onFilterEditorChange({ description: event.target.value })}
            />
          </div>

          <Button
            className="tr-filter__add"
            variant="secondary"
            block
            testId="tr-filter-add"
            icon={<Icon name="Plus" size={14} />}
            disabled={!filterHasContent(filterEditor)}
            onClick={onFilterAdd}
          >
            添加条件
          </Button>

          {filterDraft.length > 0 ? (
            <div className="tr-filter__list">
              {filterDraft.map((filter, index) => (
                <div className="tr-filter__item" data-testid="tr-filter-item" key={index}>
                  <div className="tr-filter__item-body">
                    <span>{filterSummary(filter)}</span>
                    {filter.tags.length > 0 && filter.tagNot ? (
                      <>
                        <span className="tr-filter__separator">/</span>
                        <span className="tr-filter__flag">标签取反</span>
                      </>
                    ) : null}
                  </div>
                  <Button
                    variant="text-danger"
                    size="sm"
                    testId="tr-filter-item-remove"
                    aria-label="删除筛选条件"
                    title="删除筛选条件"
                    icon={<Icon name="Trash" size={14} />}
                    onClick={() => onFilterRemove(index)}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="tr-modal-footer">
            <Button variant="secondary" testId="tr-filter-clear" onClick={onFilterClear}>
              清除条件
            </Button>
            <Button variant="secondary" onClick={onFilterClose}>
              取消
            </Button>
            <Button variant="primary" testId="tr-filter-apply" onClick={onFilterApply}>
              确认
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
