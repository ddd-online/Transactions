import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type JSX } from 'react'

import { centsToYuan, yuanToCents } from '../../shared/domain/money'
import type { Ledger } from '../../shared/domain/models'
import { formatTimestamp, rangeToSeconds, todayYmd } from '../../shared/domain/time'
import { addMonths, monthSpan, parseYmd, parseYearMonth, yearSpan } from '../../shared/domain/calendar'
import type {
  QueryConditionSortField,
  TransactionRecordDto,
  TrQueryCondition,
  TrQueryResult,
} from '../../shared/types/transaction'
import type { CategoryDto } from '../../shared/types/category'
import type { TagDto } from '../../shared/types/category'
import type { TransactionTemplateDto } from '../../shared/types/template'
import { notify } from '../components/toast'
import {
  AutoComplete,
  Dropdown,
  Input,
  Modal,
  Popconfirm,
  Select,
  Table,
  type MenuProps,
  type TableProps,
} from 'antd'

import { Button } from '../components/button'
import { IdentityDot } from '../components/identity-dot'
import { Pagination } from '../components/pagination'
import { Icon } from '../components/icon'
import { Segmented } from '../components/segmented'
import { DatePicker } from '../components/date-picker'
import { PageLayout } from '../components/page-layout'
import { ScrollArea } from '../components/scroll-area'
import { TimeRangePicker, type TimeRangeMode } from '../components/time-range-picker'
import { Tooltip } from '../components/tooltip'

/**
 * 新增记录的默认日期：列表里选中的是某一天就记那天，否则记今天。
 *
 * 选了单日说明用户就是在那天的账目上下文里操作，默认再落到今天会让新记录
 * 直接从当前列表里消失；跨天范围没有唯一的目标日，仍以今天为准。
 */
function composerDefaultDate(start: string, end: string): string {
  return start && start === end ? start : todayYmd()
}

/**
 * 某分类 + 交易类型下的标签名（去重）。
 *
 * 标签在库里按 `分类:交易类型` 归档，所以选项必须跟着分类走；跨分类把标签全列出来，
 * 会让人把别的分类的标签记到这条记录上。
 */
function tagNamesForCategory(
  tags: readonly TagDto[],
  category: string,
  transactionType: string,
): string[] {
  const key = `${category.trim()}:${transactionType}`
  return Array.from(
    new Set(
      tags.filter((tag) => tag.categoryTransactionType === key).map((tag) => tag.name),
    ),
  )
}

/** 选中的日期 → 当天本地的 Unix 秒（记账只关心哪一天，取正午避开时区边界）。 */
function timestampOfYmd(ymd: string): number {
  const parsed = parseYmd(ymd)
  if (!parsed) return Math.floor(Date.now() / 1000)
  return Math.trunc(new Date(parsed.year, parsed.month - 1, parsed.day, 12, 0, 0).getTime() / 1000)
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function signedAmount(transactionType: string, cents: number): string {
  const text = centsToYuan(cents)
  if (transactionType === 'income') return `+${text}`
  if (transactionType === 'expense') return `-${text}`
  return text
}

function typeLabel(transactionType: string): string {
  if (transactionType === 'income') return '收入'
  if (transactionType === 'expense') return '支出'
  if (transactionType === 'transfer') return '转账'
  return transactionType
}

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
  if (filter.transactionType) parts.push(typeLabel(filter.transactionType))
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

const COMPOSER_TYPE_OPTIONS = [
  { value: 'income', label: '收入' },
  { value: 'expense', label: '支出' },
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
  const [rangeMode, setRangeMode] = useState<TimeRangeMode>('date')
  const [rangeStart, setRangeStart] = useState(todayYmd())
  const [rangeEnd, setRangeEnd] = useState(todayYmd())
  const [committedRange, setCommittedRange] = useState(() => {
    const today = todayYmd()
    return { start: today, end: today }
  })

  const [filters, setFilters] = useState<RecordFilter[]>([])
  const [filterDraft, setFilterDraft] = useState<RecordFilter[]>([])
  const [filterEditor, setFilterEditor] = useState<RecordFilter>(emptyFilter)
  const [showFilter, setShowFilter] = useState(false)
  const [sortFields, setSortFields] = useState<QueryConditionSortField[]>(DEFAULT_SORT)
  const [sortDraft, setSortDraft] = useState<QueryConditionSortField[]>(DEFAULT_SORT)
  const [showSort, setShowSort] = useState(false)

  const [showComposer, setShowComposer] = useState(false)
  const [editingRecord, setEditingRecord] = useState<TransactionRecordDto | null>(null)
  const [saving, setSaving] = useState(false)
  const [composerError, setComposerError] = useState('')
  const [recordDate, setRecordDate] = useState(todayYmd())
  const [amount, setAmount] = useState('')
  const [type, setType] = useState('expense')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [tagList, setTagList] = useState<string[]>([])
  const [templateId, setTemplateId] = useState('')
  const [outlier, setOutlier] = useState(false)
  const [keyEventDate, setKeyEventDate] = useState('')

  const [syncingId, setSyncingId] = useState('')
  const contentRef = useRef<HTMLDivElement>(null)

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

  const resetComposerFields = useCallback((): void => {
    setEditingRecord(null)
    setComposerError('')
    setRecordDate(composerDefaultDate(committedRange.start, committedRange.end))
    setAmount('')
    setType('expense')
    setCategory('')
    setDescription('')
    setTagList([])
    setTemplateId('')
    setOutlier(false)
    setKeyEventDate('')
  }, [committedRange.end, committedRange.start])

  const openComposer = useCallback((): void => {
    resetComposerFields()
    setShowComposer(true)
  }, [resetComposerFields])

  const openEdit = useCallback((record: TransactionRecordDto): void => {
    setEditingRecord(record)
    setComposerError('')
    setRecordDate(formatTimestamp(record.transactionAt, 'YYYY-MM-DD'))
    setAmount(centsToYuan(record.price))
    setType(record.transactionType)
    setCategory(record.category)
    setDescription(record.description)
    setTagList([...record.tags])
    setTemplateId('')
    setOutlier(record.outlier)
    setKeyEventDate(record.keyEventDate)
    setShowComposer(true)
  }, [])

  const closeComposer = useCallback((): void => {
    setShowComposer(false)
    setEditingRecord(null)
  }, [])

  const saveRecord = useCallback(async (): Promise<void> => {
    setComposerError('')
    if (saving) return
    if (!ledgerId) {
      setComposerError('请先选择账本')
      return
    }
    if (!category.trim()) {
      setComposerError('请填写分类')
      return
    }
    let price: number
    try {
      price = yuanToCents(amount)
    } catch (moneyError) {
      setComposerError(errorMessage(moneyError))
      return
    }
    if (price === 0) {
      setComposerError('金额不能为 0')
      return
    }

    setSaving(true)
    try {
      const newId = await window.api.invoke('tr_create', {
        ledgerId,
        transactionId: '',
        price,
        transactionType: type,
        category: category.trim(),
        description: description.trim(),
        tags: tagList,
        transactionAt: timestampOfYmd(recordDate),
        outlier,
        keyEventDate: '',
      })
      try {
        if (keyEventDate) {
          await window.api.invoke('tr_link', { transaction_id: newId, date: keyEventDate })
        }
      } catch (linkError) {
        await window.api.invoke('tr_delete', { id: newId }).catch(() => undefined)
        throw linkError
      }

      if (editingRecord) {
        try {
          await window.api.invoke('tr_delete', { id: editingRecord.transactionId })
        } catch (deleteError) {
          try {
            await window.api.invoke('tr_delete', { id: newId })
            setComposerError(`删除旧记录失败：${errorMessage(deleteError)}`)
          } catch {
            setComposerError('新记录已保存，但旧记录清理失败，请手动删除重复记录')
          }
          return
        }
      }

      notify(editingRecord ? '记录已更新' : '已记一笔')
      setShowComposer(false)
      resetComposerFields()
      setPage(1)
      await load()
    } catch (createError) {
      setComposerError(errorMessage(createError))
    } finally {
      setSaving(false)
    }
  }, [
    amount,
    category,
    description,
    editingRecord,
    keyEventDate,
    ledgerId,
    load,
    outlier,
    recordDate,
    resetComposerFields,
    saving,
    tagList,
    type,
  ])

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

  const applyTemplate = useCallback((nextId: string): void => {
    setTemplateId(nextId)
    if (!nextId) return
    const template = templates.find((item) => item.templateId === nextId)
    if (!template) return
    setType(template.transactionType)
    setCategory(template.category)
    setDescription(template.description)
    setTagList(template.tags)
  }, [templates])

  const saveTemplate = useCallback(async (): Promise<void> => {
    setComposerError('')
    if (!ledgerId) {
      setComposerError('请先选择账本')
      return
    }
    const name = `${typeLabel(type)} · ${category.trim() || '模板'}`
    try {
      const createdId = await window.api.invoke('template_create', {
        template_id: '',
        ledger_id: ledgerId,
        template_name: name,
        transaction_type: type,
        category: category.trim(),
        tags: tagList,
        flags: '',
        description: description.trim(),
        sort_order: templates.length + 1,
      })
      const rows = await window.api.invoke('template_list', { ledger_id: ledgerId })
      setTemplates(rows)
      setTemplateId(createdId)
      notify('模板已保存')
    } catch (templateError) {
      setComposerError(errorMessage(templateError))
    }
  }, [category, description, ledgerId, tagList, templates.length, type])

  const goLastMonth = useCallback((): void => {
    const parsed = parseYearMonth(todayYmd())
    if (!parsed) return
    const [year, month] = addMonths(parsed[0], parsed[1], -1)
    const [from, to] = monthSpan(year, month)
    setRangeMode('month')
    setRangeStart(from)
    setRangeEnd(to)
  }, [])

  const goThisYear = useCallback((): void => {
    const parsed = parseYearMonth(todayYmd())
    if (!parsed) return
    const [from, to] = yearSpan(parsed[0])
    setRangeMode('year')
    setRangeStart(from)
    setRangeEnd(to)
  }, [])

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

  const uniqueTagNames = Array.from(new Set(tagOptions.map((tag) => tag.name)))
  const tagSelectOptions = uniqueTagNames.map((name) => ({ value: name, label: name }))
  const composerTagOptions = tagNamesForCategory(tagOptions, category, type).map((name) => ({
    value: name,
    label: name,
  }))
  const activeFilterCount = filters.filter(filterHasContent).length

  /** 分类 / 类型一变，已选但不属于新组合的标签要摘掉，避免继续带着别的分类的标签保存。 */
  const changeComposerCategory = useCallback(
    (next: string): void => {
      setCategory(next)
      const valid = new Set(tagNamesForCategory(tagOptions, next, type))
      setTagList((current) => current.filter((name) => valid.has(name)))
    },
    [tagOptions, type],
  )

  const changeComposerType = useCallback(
    (next: string): void => {
      setType(next)
      const valid = new Set(tagNamesForCategory(tagOptions, category, next))
      setTagList((current) => current.filter((name) => valid.has(name)))
    },
    [category, tagOptions],
  )

  const categoryOptionsFor = (transactionType: string): Array<{ value: string; label: string }> => {
    const names = new Set<string>()
    for (const item of categories) {
      if (!transactionType || item.transactionType === transactionType) names.add(item.name)
    }
    return Array.from(names).map((name) => ({ value: name, label: name }))
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const syncMenuFor = (record: TransactionRecordDto): MenuProps => ({
    items:
      otherLedgers.length > 0
        ? otherLedgers.map((ledger) => ({ key: ledger.id, label: ledger.name }))
        : [{ key: '__none__', label: '无可用账本', disabled: true }],
    onClick: ({ key }) => {
      if (key !== '__none__') void syncRecord(record, key)
    },
  })

  const columns: TableProps<TransactionRecordDto>['columns'] = [
    {
      title: '日期',
      dataIndex: 'transactionAt',
      width: 100,
      align: 'center',
      render: (value: number) => (
        <span
          className="tr-cell-date"
          title={formatTimestamp(value, 'YYYY-MM-DD HH:mm:ss')}
        >
          {formatTimestamp(value, 'MM-DD')}
        </span>
      ),
    },
    {
      title: '类型',
      dataIndex: 'transactionType',
      width: 100,
      align: 'center',
      render: (value: string) => (
        <span className={`tr-cell-type type-${value}`}>{typeLabel(value)}</span>
      ),
    },
    {
      title: '分类',
      dataIndex: 'category',
      width: 100,
      align: 'center',
      render: (value: string, row: TransactionRecordDto) => (
        <span className="tr-cell-category">
          <IdentityDot seed={`${ledgerId}:${row.transactionType}:${value}`} size={6} />
          {value}
        </span>
      ),
    },
    {
      title: '标签',
      dataIndex: 'tags',
      width: 180,
      align: 'center',
      render: (value: string[]) =>
        value.length > 0 ? (
          <span className="tr-cell-tags">
            {value.map((tag) => (
              <span key={tag} className="ui-tag tag-item">
                {tag}
              </span>
            ))}
          </span>
        ) : (
          '-'
        ),
    },
    {
      title: '描述',
      dataIndex: 'description',
      ellipsis: true,
      render: (value: string) => (
        <span className="tr-cell-description" title={value}>
          {value || '-'}
        </span>
      ),
    },
    {
      title: '金额',
      dataIndex: 'price',
      align: 'right',
      width: 110,
      render: (value: number, row) => (
        <span className={`tr-cell-price price-${row.transactionType}`}>
          {signedAmount(row.transactionType, value)}
        </span>
      ),
    },
    {
      title: '标记',
      width: 100,
      align: 'center',
      render: (_, row) => (
        <span className="tr-cell-marks">
          {row.outlier ? <span className="ui-tag ui-tag--outlier">离群值</span> : null}
          {row.keyEventDate ? (
            <span className="tr-cell-mark" title={`已关联至 ${row.keyEventDate}`}>
              <Icon name="Star" size={14} />
            </span>
          ) : null}
        </span>
      ),
    },
    {
      title: '操作',
      width: 130,
      align: 'center',
      render: (_, row) => {
        const syncing = syncingId === row.transactionId
        return (
          <div className="tr-cell-actions">
            <Tooltip text="编辑记录">
              <button
                type="button"
                className="tr-icon-btn"
                data-testid="tr-edit"
                aria-label="编辑记录"
                onClick={() => openEdit(row)}
              >
                <Icon name="Edit" size={15} />
              </button>
            </Tooltip>

            <Tooltip text="同步到其他账本">
              <Dropdown
                trigger={['click']}
                disabled={syncing}
                menu={syncMenuFor(row)}
              >
                <button
                  type="button"
                  className="tr-icon-btn"
                  data-testid="tr-sync"
                  aria-label="同步到其他账本"
                  disabled={syncing}
                >
                  <span className={syncing ? 'tr-sync-icon is-spinning' : 'tr-sync-icon'}>
                    <Icon name="Sync" size={15} />
                  </span>
                </button>
              </Dropdown>
            </Tooltip>

            <Popconfirm
              title="删除这条消费记录？"
              okText="删除"
              okType="danger"
              showCancel={false}
              placement="topRight"
              onConfirm={() => void remove(row.transactionId)}
            >
              <button
                type="button"
                className="tr-icon-btn is-danger"
                data-testid="tr-delete"
                aria-label="删除记录"
              >
                <Icon name="Trash" size={15} />
              </button>
            </Popconfirm>
          </div>
        )
      },
    },
  ]

  return (
    <PageLayout
      contentClassName="tr-page-content"
      footerClassName="page-footer-bar--end"
      footer={
        <div className="statistics-footer">
          <div className="statistics-footer-item">
            <span className="statistics-footer-item-label">收入</span>
            <span className="statistics-footer-item-value income" data-testid="tr-stat-income">
              {centsToYuan(statistics.income ?? 0)}
            </span>
          </div>
          <div className="statistics-footer-divider" />
          <div className="statistics-footer-item">
            <span className="statistics-footer-item-label">支出</span>
            <span className="statistics-footer-item-value expense" data-testid="tr-stat-expense">
              {centsToYuan(statistics.expense ?? 0)}
            </span>
          </div>
          <div className="statistics-footer-divider" />
          <div className="statistics-footer-item">
            <span className="statistics-footer-item-label">转账</span>
            <span className="statistics-footer-item-value transfer" data-testid="tr-stat-transfer">
              {centsToYuan(statistics.transfer ?? 0)}
            </span>
          </div>
        </div>
      }
      toolbar={
        <>
          <div className="m0-actions">
            <TimeRangePicker
              testId="tr-time"
              mode={rangeMode}
              start={rangeStart}
              end={rangeEnd}
              onModeChange={setRangeMode}
              onRangeChange={(start, end) => {
                setRangeStart(start)
                setRangeEnd(end)
              }}
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
      <div className="tr-body">
        {error ? (
          <p className="m0-error tr-error" data-testid="tr-error">
            {error}
          </p>
        ) : null}

        <div className="tr-content" ref={contentRef}>
          <ScrollArea className="tr-scroll" axis="both" notifyResize>
            {rows.length === 0 ? (
              <div className="tr-empty" data-testid="tr-empty">
                <span className="tr-empty-icon">
                  <Icon name="Transaction" size={56} />
                </span>
                <h3>{ledgerId ? (loading ? '加载中…' : '今天还没有记录') : '请先创建/选择账本'}</h3>
                {ledgerId ? <p className="m0-muted">换个时间范围，或直接记一笔。</p> : null}
                <div className="m0-actions">
                  <Button variant="secondary" onClick={goLastMonth}>
                    上月
                  </Button>
                  <Button variant="secondary" onClick={goThisYear}>
                    今年
                  </Button>
                  <Button variant="primary" onClick={openComposer}>
                    记一笔
                  </Button>
                </div>
              </div>
            ) : (
              <Table<TransactionRecordDto>
                className="tr-table"
                rowKey="transactionId"
                columns={columns}
                dataSource={rows}
                pagination={false}
                size="small"
                sticky={{
                  getContainer: () =>
                    contentRef.current?.querySelector<HTMLElement>(
                      '[data-overlayscrollbars-viewport]',
                    ) ??
                    contentRef.current ??
                    window,
                }}
                rowClassName={(row) => `row-type-${row.transactionType}`}
                onRow={() => ({ 'data-testid': 'tr-row' }) as HTMLAttributes<HTMLElement>}
              />
            )}
          </ScrollArea>
        </div>

        <div className="tr-footer">
          <span className="tr-footer-total" data-testid="tr-total">
            共 {total} 条
          </span>
          <div className="tr-footer-controls">
            <Pagination
              page={page}
              totalPages={totalPages}
              disabled={loading}
              showSummary={false}
              onChange={(next) => setPage(next)}
            />
            <Select
              data-testid="tr-page-size"
              aria-label="每页条数"
              value={pageSize}
              style={{ width: 110 }}
              onChange={(value) => {
                setPageSize(value)
                setPage(1)
              }}
              options={[
                { value: 15, label: '15 条/页' },
                { value: 30, label: '30 条/页' },
                { value: 50, label: '50 条/页' },
              ]}
            />
          </div>
        </div>
      </div>

      <Modal
        open={showComposer}
        title={editingRecord ? '编辑记录' : '新增记录'}
        width={640}
        centered
        destroyOnHidden
        footer={null}
        onCancel={closeComposer}
      >
        <div className="tr-modal-form">
          <div className="tr-modal-field">
            <span className="tr-modal-label">模板</span>
            <div className="tr-modal-template">
              <Select
                className="tr-modal-template-select"
                data-testid="tr-template-select"
                value={templateId || undefined}
                placeholder="选择模板"
                allowClear
                popupMatchSelectWidth={false}
                onChange={(value: string | undefined) => applyTemplate(value ?? '')}
                options={templates.map((template) => ({
                  value: template.templateId,
                  label: template.templateName,
                }))}
              />
              <Button
                variant="secondary"
                testId="tr-template-save"
                disabled={!ledgerId}
                onClick={() => void saveTemplate()}
              >
                保存为模板
              </Button>
            </div>
          </div>

          <div className="tr-modal-row">
            <div className="tr-modal-field">
              <span className="tr-modal-label">日期</span>
              <DatePicker testId="tr-date" value={recordDate} onChange={setRecordDate} />
            </div>

            <div className="tr-modal-field">
              <span className="tr-modal-label">类型</span>
              <Segmented
                testId="tr-new-type"
                block
                value={type}
                onChange={changeComposerType}
                options={COMPOSER_TYPE_OPTIONS}
              />
            </div>
          </div>

          <div className="tr-modal-row">
            <div className="tr-modal-field">
              <span className="tr-modal-label">分类</span>
              <AutoComplete
                value={category}
                options={categoryOptionsFor(type)}
                filterOption
                onChange={changeComposerCategory}
              >
                <Input data-testid="tr-category" placeholder="选择或输入分类" />
              </AutoComplete>
            </div>

            <div className="tr-modal-field">
              <span className="tr-modal-label">标签</span>
              <Select
                data-testid="tr-tags"
                mode="tags"
                allowClear
                virtual={false}
                placeholder="选择一个或多个标签"
                value={tagList}
                onChange={(value: string[]) => setTagList(value)}
                options={composerTagOptions}
                notFoundContent={
                  category.trim() ? '该分类下暂无标签' : '先填写分类，再选择标签'
                }
              />
            </div>
          </div>

          <div className="tr-modal-row">
            <div className="tr-modal-field">
              <span className="tr-modal-label">标记</span>
              <Select
                data-testid="tr-outlier"
                mode="multiple"
                allowClear
                placeholder="选择标记"
                value={outlier ? ['outlier'] : []}
                onChange={(values: string[]) => setOutlier(values.includes('outlier'))}
                options={[{ value: 'outlier', label: '离群值' }]}
              />
            </div>

            <div className="tr-modal-field">
              <span className="tr-modal-label">关联事件日期</span>
              <DatePicker
                testId="tr-event-date"
                value={keyEventDate}
                onChange={setKeyEventDate}
                allowClear
              />
            </div>
          </div>

          <div className="tr-modal-field">
            <span className="tr-modal-label">描述</span>
            <Input
              data-testid="tr-description"
              placeholder="描述消费内容"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="tr-modal-field">
            <span className="tr-modal-label">金额</span>
            <Input
              data-testid="tr-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>

          {composerError ? (
            <p className="m0-error" data-testid="tr-error">
              {composerError}
            </p>
          ) : null}

          <div className="tr-modal-footer">
            <Button variant="secondary" testId="tr-cancel" onClick={closeComposer}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="tr-save"
              loading={saving}
              disabled={!ledgerId || saving || loading}
              onClick={() => void saveRecord()}
            >
              保存
            </Button>
          </div>
        </div>
      </Modal>

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
                data-testid="tr-filter-category"
                value={filterEditor.category || undefined}
                placeholder="选择消费分类"
                allowClear
                onChange={(value: string | undefined) =>
                  updateFilterEditor({ category: value ?? '' })
                }
                options={categoryOptionsFor(filterEditor.transactionType)}
              />
            </div>

            <div className="tr-modal-field">
              <span className="tr-modal-label">标签</span>
              <Select
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
