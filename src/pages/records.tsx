import { useCallback, useEffect, useState, type JSX } from 'react'

import type { Ledger } from '../../shared/domain/models'
import { transactionTypeText } from '../../shared/domain/format'
import { rangeToSeconds, todayYmd } from '../../shared/domain/time'
import { addMonths, monthSpan, parseYearMonth, yearSpan } from '../../shared/domain/calendar'
import type {
  QueryConditionSortField,
  TransactionRecordDto,
  TrQueryCondition,
  TrQueryResult,
} from '../../shared/types/transaction'
import type { CategoryDto } from '../../shared/types/category'
import type { TagDto } from '../../shared/types/category'
import type { TransactionTemplateDto } from '../../shared/types/template'
import { errorMessage } from '../../shared/errors'
import { notify } from '../components/toast'
import { Input, Modal, Select } from 'antd'

import { Button } from '../components/button'
import { Icon } from '../components/icon'
import { Segmented } from '../components/segmented'
import { PageLayout } from '../components/page-layout'
import { TimeRangePicker } from '../components/time-range-picker'
import { useSessionTimeRange } from '../state/time-range-session'
import { RecordComposer } from './record-composer'
import { RecordsStatistics, RecordsTable } from './records-table'
import {
  type ComposerRequest,
  allTagOptions,
  categoryOptions,
  composerDefaultDate,
} from './record-draft'

interface RecordFilter {
  transactionType: string
  category: string
  tags: string[]
  tagPolicy: string
  tagNot: boolean
  description: string
}

function emptyFilter(): RecordFilter {
  return {
    transactionType: '',
    category: '',
    tags: [],
    tagPolicy: 'any',
    tagNot: false,
    description: '',
  }
}

function filterHasContent(filter: RecordFilter): boolean {
  return Boolean(
    filter.transactionType || filter.category || filter.tags.length > 0 || filter.description.trim(),
  )
}

/** 条件列表里的一行摘要，例如：`收入 / 工资奖金 / 工资`。 */
function filterSummary(filter: RecordFilter): string {
  const parts: string[] = []
  if (filter.transactionType) parts.push(transactionTypeText(filter.transactionType))
  if (filter.category) parts.push(filter.category)
  if (filter.tags.length > 0) parts.push(filter.tags.join('、'))
  if (filter.description.trim()) parts.push(`"${filter.description.trim()}"`)
  return parts.join(' / ')
}

function toQueryItem(filter: RecordFilter) {
  return {
    transactionType: filter.transactionType,
    category: filter.category,
    tags: filter.tags,
    tagPolicy: filter.tags.length > 0 ? filter.tagPolicy : '',
    tagNot: filter.tags.length > 0 && filter.tagNot,
    description: filter.description.trim(),
  }
}

const DEFAULT_SORT: QueryConditionSortField[] = [{ field: 'transactionAt', order: 'desc' }]

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

function nextSortField(fields: readonly QueryConditionSortField[]): string {
  const used = new Set(fields.map((field) => field.field))
  return SORT_FIELD_OPTIONS.find((option) => !used.has(option.value))?.value ?? 'transactionAt'
}

export interface RecordsPageProps {
  ledgerId: string
  ledgers: Ledger[]
}

export function RecordsPage({ ledgerId, ledgers }: RecordsPageProps): JSX.Element {
  const [rows, setRows] = useState<TransactionRecordDto[]>([])
  const [total, setTotal] = useState(0)
  const [statistics, setStatistics] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [tagOptions, setTagOptions] = useState<TagDto[]>([])
  const [templates, setTemplates] = useState<TransactionTemplateDto[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [pageSize, setPageSize] = useState(15)
  const [range, updateRange] = useSessionTimeRange('records', () => ({
    mode: 'date',
    start: todayYmd(),
    end: todayYmd(),
  }))
  const { mode: rangeMode, start: rangeStart, end: rangeEnd } = range
  const [committedRange, setCommittedRange] = useState(() => ({
    start: range.start,
    end: range.end,
  }))

  const [filters, setFilters] = useState<RecordFilter[]>([])
  const [filterDraft, setFilterDraft] = useState<RecordFilter[]>([])
  const [filterEditor, setFilterEditor] = useState<RecordFilter>(emptyFilter)
  const [showFilter, setShowFilter] = useState(false)
  const [sortFields, setSortFields] = useState<QueryConditionSortField[]>(DEFAULT_SORT)
  const [sortDraft, setSortDraft] = useState<QueryConditionSortField[]>(DEFAULT_SORT)
  const [showSort, setShowSort] = useState(false)

  /** 表单的开关与草稿都在 composer 里：页面只递这份请求，回执负责关窗与刷新。 */
  const [composerRequest, setComposerRequest] = useState<ComposerRequest | null>(null)

  const [syncingId, setSyncingId] = useState('')

  useEffect(() => {
    if (!ledgerId) {
      setCategories([])
      setTagOptions([])
      setTemplates([])
      return
    }
    void (async () => {
      try {
        const [categoryRows, tagRows, templateRows] = await Promise.all([
          window.api.invoke('category_list', { ledgerId, type: '' }),
          window.api.invoke('tag_list', { ledgerId, categoryTransactionType: '' }),
          window.api.invoke('template_list', { ledger_id: ledgerId }),
        ])
        setCategories(categoryRows)
        setTagOptions(tagRows)
        setTemplates(templateRows)
      } catch {
        // 分类/标签只是输入建议，读取失败不阻塞记账
      }
    })()
  }, [ledgerId])

  useEffect(() => {
    if (rangeStart && rangeEnd) {
      setCommittedRange({ start: rangeStart, end: rangeEnd })
    }
  }, [rangeStart, rangeEnd])

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setRows([])
      setTotal(0)
      setStatistics({})
      return
    }
    setLoading(true)
    setError('')
    try {
      const condition: TrQueryCondition = {
        ledgerId,
        offset: (page - 1) * pageSize,
        limit: pageSize,
        tsRange: rangeToSeconds(committedRange.start, committedRange.end) ?? [],
        items: filters.filter(filterHasContent).map(toQueryItem),
        sortFields: sortFields.length > 0 ? sortFields : DEFAULT_SORT,
      }
      const result: TrQueryResult = await window.api.invoke('tr_query', condition)
      setRows(result.items)
      setTotal(result.total)
      setStatistics(result.trStatistics)
    } catch (loadError) {
      setError(errorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [committedRange.end, committedRange.start, filters, ledgerId, page, pageSize, sortFields])

  useEffect(() => {
    void load()
  }, [load])

  const openComposer = useCallback((): void => {
    setComposerRequest({
      mode: 'create',
      defaultDate: composerDefaultDate(committedRange.start, committedRange.end),
    })
  }, [committedRange.end, committedRange.start])

  const openEdit = useCallback((record: TransactionRecordDto): void => {
    setComposerRequest({ mode: 'edit', record })
  }, [])

  /** 保存成功：关表单、回第一页、刷新列表（与抽取前同一条收尾）。 */
  const handleSaved = useCallback((): void => {
    setComposerRequest(null)
    setPage(1)
    void load()
  }, [load])

  const closeComposer = useCallback((): void => {
    setComposerRequest(null)
  }, [])

  const otherLedgers = ledgers.filter((ledger) => ledger.id !== ledgerId)

  const syncRecord = useCallback(
    async (record: TransactionRecordDto, targetLedgerId: string): Promise<void> => {
      if (!targetLedgerId || syncingId) return
      setSyncingId(record.transactionId)
      try {
        await window.api.invoke('tr_create', {
          ledgerId: targetLedgerId,
          transactionId: '',
          price: record.price,
          transactionType: record.transactionType,
          category: record.category,
          description: record.description,
          tags: record.tags,
          transactionAt: record.transactionAt,
          outlier: record.outlier,
          keyEventDate: '',
        })
        notify('同步成功')
      } catch (syncError) {
        notify(`同步失败：${errorMessage(syncError)}`, 'error')
      } finally {
        setSyncingId('')
      }
    },
    [syncingId],
  )

  const remove = useCallback(
    async (id: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('tr_delete', { id })
        notify('记录已删除')
        await load()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      }
    },
    [load],
  )

  const goLastMonth = useCallback((): void => {
    const parsed = parseYearMonth(todayYmd())
    if (!parsed) return
    const [year, month] = addMonths(parsed[0], parsed[1], -1)
    const [from, to] = monthSpan(year, month)
    updateRange({ mode: 'month', start: from, end: to })
  }, [updateRange])

  const goThisYear = useCallback((): void => {
    const parsed = parseYearMonth(todayYmd())
    if (!parsed) return
    const [from, to] = yearSpan(parsed[0])
    updateRange({ mode: 'year', start: from, end: to })
  }, [updateRange])

  const openFilter = useCallback((): void => {
    setFilterDraft(filters.map((filter) => ({ ...filter, tags: [...filter.tags] })))
    setFilterEditor(emptyFilter())
    setShowFilter(true)
  }, [filters])

  const updateFilterEditor = useCallback((patch: Partial<RecordFilter>): void => {
    setFilterEditor((current) => ({ ...current, ...patch }))
  }, [])

  /** 把编辑区当前条件收进列表并清空编辑区；什么都没填时不收录。 */
  const addFilterCondition = useCallback((): void => {
    if (!filterHasContent(filterEditor)) return
    setFilterDraft((current) => [...current, { ...filterEditor, tags: [...filterEditor.tags] }])
    setFilterEditor(emptyFilter())
  }, [filterEditor])

  const removeFilterCondition = useCallback((index: number): void => {
    setFilterDraft((current) => current.filter((_, position) => position !== index))
  }, [])

  const applyFilters = useCallback((): void => {
    // 编辑区里还没点「添加条件」的内容也一并生效，避免填完直接确认被丢掉
    const next = filterHasContent(filterEditor)
      ? [...filterDraft, { ...filterEditor, tags: [...filterEditor.tags] }]
      : filterDraft
    setFilters(next.map((filter) => ({ ...filter, tags: [...filter.tags] })))
    setPage(1)
    setShowFilter(false)
  }, [filterDraft, filterEditor])

  const clearFilters = useCallback((): void => {
    setFilterDraft([])
    setFilterEditor(emptyFilter())
  }, [])

  const openSort = useCallback((): void => {
    setSortDraft(sortFields.map((field) => ({ ...field })))
    setShowSort(true)
  }, [sortFields])

  const updateSort = useCallback((index: number, patch: Partial<QueryConditionSortField>): void => {
    setSortDraft((current) =>
      current.map((field, position) => (position === index ? { ...field, ...patch } : field)),
    )
  }, [])

  const addSortField = useCallback((): void => {
    setSortDraft((current) => [
      ...current,
      { field: nextSortField(current), order: 'desc' },
    ])
  }, [])

  const removeSortField = useCallback((index: number): void => {
    setSortDraft((current) => current.filter((_, position) => position !== index))
  }, [])

  const applySort = useCallback((): void => {
    setSortFields(sortDraft.length > 0 ? sortDraft.map((field) => ({ ...field })) : DEFAULT_SORT)
    setPage(1)
    setShowSort(false)
  }, [sortDraft])

  const tagSelectOptions = allTagOptions(tagOptions)
  const activeFilterCount = filters.filter(filterHasContent).length

  return (
    <PageLayout
      contentClassName="tr-page-content"
      footerClassName="page-footer-bar--end"
      footer={<RecordsStatistics statistics={statistics} />}
      toolbar={
        <>
          <div className="m0-actions">
            <TimeRangePicker
              testId="tr-time"
              mode={rangeMode}
              start={rangeStart}
              end={rangeEnd}
              onModeChange={(mode) => updateRange({ mode })}
              onRangeChange={(start, end) => updateRange({ start, end })}
            />
          </div>
        <div className="m0-actions">
          <Button
            variant="secondary"
            testId="tr-sort"
            icon={<Icon name="SortDesc" size={14} />}
            onClick={openSort}
          >
            排序
          </Button>
          <Button
            variant="secondary"
            testId="tr-filter"
            icon={<Icon name="Filter" size={14} />}
            onClick={openFilter}
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
            onClick={openComposer}
          >
            记一笔
          </Button>
          </div>
        </>
      }
    >
      <RecordsTable
        ledgerId={ledgerId}
        rows={rows}
        total={total}
        loading={loading}
        error={error}
        page={page}
        pageSize={pageSize}
        syncingId={syncingId}
        otherLedgers={otherLedgers}
        onPageChange={setPage}
        onPageSizeChange={(value) => {
          setPageSize(value)
          setPage(1)
        }}
        onEdit={openEdit}
        onSync={syncRecord}
        onRemove={remove}
        onLastMonth={goLastMonth}
        onThisYear={goThisYear}
        onCreate={openComposer}
      />

      <RecordComposer
        ledgerId={ledgerId}
        request={composerRequest}
        categories={categories}
        tagRows={tagOptions}
        templates={templates}
        listLoading={loading}
        onSaved={handleSaved}
        onRequestClose={closeComposer}
        onTemplatesChanged={setTemplates}
      />

      <Modal
        open={showSort}
        title="排序"
        width={520}
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => setShowSort(false)}
      >
        <div className="tr-sort">
          <div className="tr-sort__list">
            {sortDraft.map((field, index) => (
              <div className="tr-sort__item" key={`${field.field}-${index}`}>
                <span className="tr-sort__priority">{index + 1}</span>
                <Select
                  className="tr-sort__select tr-sort__select--field"
                  value={field.field}
                  onChange={(value: string) => updateSort(index, { field: value })}
                  options={SORT_FIELD_OPTIONS}
                />
                <Select
                  className="tr-sort__select tr-sort__select--order"
                  value={field.order}
                  onChange={(value: string) => updateSort(index, { order: value })}
                  options={SORT_ORDER_OPTIONS}
                />
                <Button
                  variant="text-danger"
                  size="sm"
                  aria-label="删除排序条件"
                  icon={<Icon name="Trash" size={14} />}
                  onClick={() => removeSortField(index)}
                />
              </div>
            ))}
          </div>
          <Button
            variant="secondary"
            block
            icon={<Icon name="Plus" size={14} />}
            onClick={addSortField}
          >
            添加排序条件
          </Button>
          <div className="tr-sort__actions">
            <Button variant="secondary" onClick={() => setSortDraft(DEFAULT_SORT)}>
              重置
            </Button>
            <Button variant="primary" testId="tr-sort-apply" onClick={applySort}>
              应用
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={showFilter}
        title="筛选条件"
        width={640}
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => setShowFilter(false)}
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
                updateFilterEditor({
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
                onChange={(value: string | undefined) =>
                  updateFilterEditor({ category: value ?? '' })
                }
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
                onChange={(value: string[]) => updateFilterEditor({ tags: value })}
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
                onChange={(value: string) => updateFilterEditor({ tagPolicy: value })}
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
                onChange={(value: string) =>
                  updateFilterEditor({ tagNot: value === 'exclude' })
                }
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
              onChange={(event) => updateFilterEditor({ description: event.target.value })}
            />
          </div>

          <Button
            className="tr-filter__add"
            variant="secondary"
            block
            testId="tr-filter-add"
            icon={<Icon name="Plus" size={14} />}
            disabled={!filterHasContent(filterEditor)}
            onClick={addFilterCondition}
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
                    onClick={() => removeFilterCondition(index)}
                  />
                </div>
              ))}
            </div>
          ) : null}

          <div className="tr-modal-footer">
            <Button variant="secondary" testId="tr-filter-clear" onClick={clearFilters}>
              清除条件
            </Button>
            <Button variant="secondary" onClick={() => setShowFilter(false)}>
              取消
            </Button>
            <Button variant="primary" testId="tr-filter-apply" onClick={applyFilters}>
              确认
            </Button>
          </div>
        </div>
      </Modal>
    </PageLayout>
  )
}
