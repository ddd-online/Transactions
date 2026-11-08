import { useCallback, useEffect, useState, type JSX } from 'react'

import type { Ledger } from '../../shared/domain/models'
import { rangeToSeconds, todayYmd } from '../../shared/domain/time'
import { addMonths, monthSpan, parseYearMonth, yearSpan } from '../../shared/domain/calendar'
import type {
  QueryConditionSortField,
  TrQueryCondition,
  TrQueryResult,
  TransactionRecordDto,
} from '../../shared/types/transaction'
import type { CategoryDto } from '../../shared/types/category'
import type { TagDto } from '../../shared/types/category'
import type { TransactionTemplateDto } from '../../shared/types/template'
import { errorMessage } from '../../shared/errors'
import { notify } from '../components/toast'

import { PageLayout } from '../components/page-layout'
import { useSessionTimeRange } from '../state/time-range-session'
import { RecordComposer } from './record-composer'
import { type ComposerRequest, composerDefaultDate } from './record-draft'
import {
  DEFAULT_SORT,
  RecordsFilterBar,
  RecordsFilterDialogs,
  emptyFilter,
  filterHasContent,
  nextSortField,
  toQueryItem,
  type RecordFilter,
} from './records-filter-bar'
import { RecordsStatistics, RecordsTable } from './records-table'

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

  const resetSortDraft = useCallback((): void => {
    setSortDraft(DEFAULT_SORT)
  }, [])

  const applySort = useCallback((): void => {
    setSortFields(sortDraft.length > 0 ? sortDraft.map((field) => ({ ...field })) : DEFAULT_SORT)
    setPage(1)
    setShowSort(false)
  }, [sortDraft])

  const activeFilterCount = filters.filter(filterHasContent).length

  return (
    <PageLayout
      contentClassName="tr-page-content"
      footerClassName="page-footer-bar--end"
      footer={<RecordsStatistics statistics={statistics} />}
      toolbar={
        <RecordsFilterBar
          rangeMode={rangeMode}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          activeFilterCount={activeFilterCount}
          onRangeModeChange={(mode) => updateRange({ mode })}
          onRangeChange={(start, end) => updateRange({ start, end })}
          onOpenSort={openSort}
          onOpenFilter={openFilter}
          onCreate={openComposer}
        />
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

      <RecordsFilterDialogs
        sortOpen={showSort}
        sortDraft={sortDraft}
        onSortClose={() => setShowSort(false)}
        onSortChange={updateSort}
        onSortAdd={addSortField}
        onSortRemove={removeSortField}
        onSortReset={resetSortDraft}
        onSortApply={applySort}
        filterOpen={showFilter}
        filterEditor={filterEditor}
        filterDraft={filterDraft}
        categories={categories}
        tagRows={tagOptions}
        onFilterClose={() => setShowFilter(false)}
        onFilterEditorChange={updateFilterEditor}
        onFilterAdd={addFilterCondition}
        onFilterRemove={removeFilterCondition}
        onFilterClear={clearFilters}
        onFilterApply={applyFilters}
      />
    </PageLayout>
  )
}
