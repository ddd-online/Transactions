import { useCallback, useEffect, useState, type JSX } from 'react'

import { centsToYuan, yuanToCents } from '../../shared/domain/money'
import { formatTimestamp, todayYmd } from '../../shared/domain/time'
import { addDays, addMonths, daysInMonth, parseYmd } from '../../shared/domain/calendar'
import type {
  TransactionRecordDto,
  TrQueryCondition,
  TrQueryResult,
} from '../../shared/types/transaction'
import type { CategoryDto } from '../../shared/types/category'
import type { TagDto } from '../../shared/types/category'
import type { TransactionTemplateDto } from '../../shared/types/template'
import { notify } from '../components/toast'
import { Pagination } from '../components/pagination'
import { Icon } from '../components/icon'
import { Segmented } from '../components/segmented'
import { DatePicker } from '../components/date-picker'
import { PageLayout } from '../components/page-layout'

function rangeOf(period: 'day' | 'month' | 'year', anchor: string): number[] {
  const ymd = parseYmd(anchor)
  if (!ymd) return []
  const start = new Date(ymd.year, ymd.month - 1, ymd.day, 0, 0, 0).getTime() / 1000
  const end =
    period === 'day'
      ? new Date(ymd.year, ymd.month - 1, ymd.day, 23, 59, 59).getTime() / 1000
      : period === 'month'
        ? new Date(ymd.year, ymd.month - 1, daysInMonth(ymd.year, ymd.month), 23, 59, 59).getTime() / 1000
        : new Date(ymd.year, 11, 31, 23, 59, 59).getTime() / 1000
  return [Math.trunc(start), Math.trunc(end)]
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

export interface RecordsPageProps {
  ledgerId: string
  onChanged?: () => void
}

export function RecordsPage({ ledgerId, onChanged }: RecordsPageProps): JSX.Element {
  const [rows, setRows] = useState<TransactionRecordDto[]>([])
  const [total, setTotal] = useState(0)
  const [statistics, setStatistics] = useState<Record<string, number>>({})
  const [page, setPage] = useState(1)
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [categories, setCategories] = useState<CategoryDto[]>([])
  const [tagOptions, setTagOptions] = useState<TagDto[]>([])
  const [outlier, setOutlier] = useState(false)
  const [keyEventDate, setKeyEventDate] = useState('')
  const [templates, setTemplates] = useState<TransactionTemplateDto[]>([])
  const [templateName, setTemplateName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showComposer, setShowComposer] = useState(false)
  const [showFilters, setShowFilters] = useState(false)
  const [pageSize, setPageSize] = useState(15)
  const [period, setPeriod] = useState<'day' | 'month' | 'year'>('day')
  const [anchor, setAnchor] = useState(todayYmd())

  const [amount, setAmount] = useState('')
  const [type, setType] = useState('expense')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')

  useEffect(() => {
    if (!ledgerId) {
      setCategories([])
      setTagOptions([])
      return
    }
    void (async () => {
      try {
        const [categoryRows, tagRows, templateRows] = await Promise.all([
          window.api.invoke('category_list', { ledgerId, type: typeFilter }),
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
  }, [ledgerId, typeFilter])

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
        tsRange: rangeOf(period, anchor),
        items:
          typeFilter || keyword || tagFilter
            ? [
                {
                  transactionType: typeFilter,
                  category: '',
                  tags: tagFilter ? [tagFilter] : [],
                  tagPolicy: tagFilter ? 'any' : '',
                  tagNot: false,
                  description: keyword,
                },
              ]
            : [],
        sortFields: [{ field: 'transactionAt', order: 'desc' }],
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
  }, [anchor, keyword, ledgerId, page, pageSize, period, tagFilter, typeFilter])

  useEffect(() => {
    void load()
  }, [load])

  const create = useCallback(async (): Promise<void> => {
    setError('')
    if (!ledgerId) {
      setError('请先选择账本')
      return
    }
    if (!category.trim()) {
      setError('请填写分类')
      return
    }
    let price: number
    try {
      price = yuanToCents(amount)
    } catch (moneyError) {
      setError(errorMessage(moneyError))
      return
    }
    if (price === 0) {
      setError('金额不能为 0')
      return
    }
    try {
      const transactionId = await window.api.invoke('tr_create', {
        ledgerId,
        transactionId: '',
        price,
        transactionType: type,
        category: category.trim(),
        description: description.trim(),
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
        transactionAt: Math.floor(Date.now() / 1000),
        outlier,
        keyEventDate,
      })
      if (keyEventDate) {
        await window.api.invoke('tr_link', { transaction_id: transactionId, date: keyEventDate })
      }
      notify('已记一笔')
      setAmount('')
      setDescription('')
      setOutlier(false)
      setKeyEventDate('')
      setPage(1)
      onChanged?.()
      await load()
    } catch (createError) {
      setError(errorMessage(createError))
    }
  }, [amount, category, description, keyEventDate, ledgerId, load, onChanged, outlier, tags, type])

  const remove = useCallback(
    async (id: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('tr_delete', { id })
        notify('记录已删除')
        onChanged?.()
        await load()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      }
    },
    [load, onChanged],
  )

  const applyTemplate = useCallback((template: TransactionTemplateDto): void => {
    setType(template.transactionType)
    setCategory(template.category)
    setDescription(template.description)
    setTags(template.tags.join(', '))
  }, [])

  const saveTemplate = useCallback(async (): Promise<void> => {
    const name = templateName.trim() || `${typeLabel(type)} · ${category.trim() || '模板'}`
    setError('')
    try {
      await window.api.invoke('template_create', {
        template_id: '',
        ledger_id: ledgerId,
        template_name: name,
        transaction_type: type,
        category: category.trim(),
        tags: tags
          .split(',')
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0),
        flags: '',
        description: description.trim(),
        sort_order: templates.length + 1,
      })
      setTemplateName('')
      const rows = await window.api.invoke('template_list', { ledger_id: ledgerId })
      setTemplates(rows)
    } catch (templateError) {
      setError(errorMessage(templateError))
    }
  }, [category, description, ledgerId, tags, templateName, templates.length, type])

  const removeTemplate = useCallback(
    async (id: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('template_delete', { id })
        const rows = await window.api.invoke('template_list', { ledger_id: ledgerId })
        setTemplates(rows)
      } catch (templateError) {
        setError(errorMessage(templateError))
      }
    },
    [ledgerId],
  )

  const shiftAnchor = (delta: number): void => {
    const ymd = parseYmd(anchor)
    if (!ymd) return
    if (period === 'day') {
      setAnchor(addDays(anchor, delta) ?? anchor)
      return
    }
    if (period === 'month') {
      const [year, month] = addMonths(ymd.year, ymd.month, delta)
      setAnchor(`${year}-${String(month).padStart(2, '0')}-01`)
      return
    }
    setAnchor(`${ymd.year + delta}-01-01`)
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  return (
    <PageLayout>
      <div className="page-toolbar">
        <div className="m0-actions">
          <Segmented
            testId="tr-period"
            value={period}
            onChange={(value) => setPeriod(value as 'day' | 'month' | 'year')}
            options={[
              { value: 'day', label: '日' },
              { value: 'month', label: '月' },
              { value: 'year', label: '年' },
            ]}
          />
          <button type="button" className="ui-btn ui-btn--text" onClick={() => shiftAnchor(-1)}>
            <Icon name="Left" size={14} />
          </button>
          <DatePicker testId="tr-anchor" value={anchor} onChange={setAnchor} showToggle={false} />
          <button type="button" className="ui-btn ui-btn--text" onClick={() => shiftAnchor(1)}>
            <Icon name="Right" size={14} />
          </button>
        </div>
        <div className="m0-actions">
          <button type="button" className="ui-btn ui-btn--secondary" data-testid="tr-sort">
            <Icon name="SortDesc" size={14} /> 排序
          </button>
          <button type="button" className="ui-btn ui-btn--secondary" data-testid="tr-filter" onClick={() => setShowFilters((open) => !open)}>
            <Icon name="Search" size={14} /> 筛选
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            data-testid="tr-new"
            onClick={() => setShowComposer((open) => !open)}
          >
            <Icon name="Plus" size={14} /> 记一笔
          </button>
        </div>
      </div>

      {showFilters ? (<div className="m0-actions m0-filter">
        <select
          className="m0-input"
          data-testid="tr-type"
          value={typeFilter}
          onChange={(event) => {
            setPage(1)
            setTypeFilter(event.target.value)
          }}
        >
          <option value="">全部类型</option>
          <option value="expense">支出</option>
          <option value="income">收入</option>
          <option value="transfer">转账</option>
        </select>
        <input
          className="m0-input"
          data-testid="tr-keyword"
          placeholder="搜索备注"
          value={keyword}
          onChange={(event) => {
            setPage(1)
            setKeyword(event.target.value)
          }}
        />
        <input
          className="m0-input"
          list="tr-tag-options"
          data-testid="tr-tag-filter"
          placeholder="按标签筛选"
          value={tagFilter}
          onChange={(event) => {
            setPage(1)
            setTagFilter(event.target.value)
          }}
        />
        <datalist id="tr-tag-options">
          {tagOptions.map((tag) => (
            <option key={tag.name} value={tag.name} />
          ))}
        </datalist>
      </div>) : null}

      {templates.length > 0 || showComposer ? (<div className="m0-actions m0-templates">
        {templates.map((template) => (
          <span key={template.templateId} className="m0-template">
            <button
              type="button"
              className="m0-link"
              data-testid="tr-template"
              onClick={() => applyTemplate(template)}
            >
              {template.templateName}
            </button>
            <button
              type="button"
              className="m0-link"
              data-testid="tr-template-delete"
              onClick={() => void removeTemplate(template.templateId)}
            >
              ×
            </button>
          </span>
        ))}
        <input
          className="m0-input"
          data-testid="tr-template-name"
          placeholder="模板名称（可空）"
          value={templateName}
          onChange={(event) => setTemplateName(event.target.value)}
        />
        <button
          type="button"
          className="m0-link"
          data-testid="tr-template-save"
          disabled={!ledgerId}
          onClick={() => void saveTemplate()}
        >
          存为模板
        </button>
      </div>) : null}

      {showComposer ? (<div className="m0-actions m0-new-record">
        <select
          className="m0-input"
          data-testid="tr-new-type"
          value={type}
          onChange={(event) => setType(event.target.value)}
        >
          <option value="expense">支出</option>
          <option value="income">收入</option>
          <option value="transfer">转账</option>
        </select>
        <input
          className="m0-input"
          data-testid="tr-amount"
          inputMode="decimal"
          placeholder="金额（元）"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <input
          className="m0-input"
          list="tr-category-options"
          data-testid="tr-category"
          placeholder="分类"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
        <datalist id="tr-category-options">
          {categories.map((item) => (
            <option key={`${item.transactionType}-${item.name}`} value={item.name} />
          ))}
        </datalist>
        <input
          className="m0-input"
          data-testid="tr-description"
          placeholder="备注"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
        />
        <input
          className="m0-input"
          data-testid="tr-tags"
          placeholder="标签（逗号分隔）"
          value={tags}
          onChange={(event) => setTags(event.target.value)}
        />
        <label className="m0-feature">
          <input
            type="checkbox"
            data-testid="tr-outlier"
            checked={outlier}
            onChange={(event) => setOutlier(event.target.checked)}
          />
          异常
        </label>
        <input
          className="m0-input"
          type="date"
          data-testid="tr-event-date"
          value={keyEventDate}
          onChange={(event) => setKeyEventDate(event.target.value)}
        />
        <button
          type="button"
          className="m0-primary"
          data-testid="tr-save"
          disabled={!ledgerId || loading}
          onClick={() => void create()}
        >
          记一笔
        </button>
      </div>) : null}

      {error ? (
        <p className="m0-error" data-testid="tr-error">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <div className="tr-empty" data-testid="tr-empty">
          <span className="tr-empty-icon">
            <Icon name="Transaction" size={56} />
          </span>
          <h3>{ledgerId ? (loading ? '加载中…' : '今天还没有记录') : '请先创建/选择账本'}</h3>
          {ledgerId ? <p className="m0-muted">换个时间范围，或直接记一笔。</p> : null}
          <div className="m0-actions">
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              onClick={() => {
                setPeriod('month')
                setAnchor(addDays(anchor, -30) ?? anchor)
              }}
            >
              上月
            </button>
            <button
              type="button"
              className="ui-btn ui-btn--secondary"
              onClick={() => {
                setPeriod('year')
                setAnchor(todayYmd())
              }}
            >
              今年
            </button>
            <button type="button" className="ui-btn ui-btn--primary" onClick={() => setShowComposer(true)}>
              记一笔
            </button>
          </div>
        </div>
      ) : (
        <table className="m0-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>类型</th>
              <th>分类</th>
              <th>备注</th>
              <th>标签</th>
              <th>标记</th>
              <th className="m0-right">金额（元）</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.transactionId} data-testid="tr-row">
                <td>{formatTimestamp(row.transactionAt, 'YYYY-MM-DD')}</td>
                <td>
                  <span className={`ui-tag ui-tag--${row.transactionType}`}>
                    {typeLabel(row.transactionType)}
                  </span>
                </td>
                <td>{row.category}</td>
                <td>{row.description}</td>
                <td>{row.tags.join('、')}</td>
                <td>
                  {row.outlier ? <span className="ui-tag ui-tag--outlier">异常</span> : null}
                  {row.outlier && row.keyEventDate ? ' · ' : ''}
                  {row.keyEventDate ? `事件 ${row.keyEventDate}` : ''}
                </td>
                <td className={`m0-right m0-amount-${row.transactionType}`}>
                  {signedAmount(row.transactionType, row.price)}
                </td>
                <td className="m0-right">
                  <button
                    type="button"
                    className="m0-link"
                    data-testid="tr-delete"
                    onClick={() => void remove(row.transactionId)}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={6}>合计</td>
              <td className="m0-right">
                {signedAmount('expense', statistics.expense ?? 0)}
                {' / '}
                {signedAmount('income', statistics.income ?? 0)}
              </td>
              <td />
            </tr>
          </tfoot>
        </table>
      )}

      <div className="page-footer-bar">
        <span className="m0-muted" data-testid="tr-total">
          共 {total} 条
        </span>
        <div className="m0-actions">
          <span className="m0-muted">收入 {centsToYuan(statistics.income ?? 0)}</span>
          <span className="m0-muted">支出 {centsToYuan(statistics.expense ?? 0)}</span>
          <span className="m0-muted">转账 {centsToYuan(statistics.transfer ?? 0)}</span>
          <Pagination
            page={page}
            totalPages={totalPages}
            disabled={loading}
            showSummary={false}
            onChange={(next) => setPage(next)}
          />
          <select
            className="m0-input tr-page-size"
            data-testid="tr-page-size"
            style={{ width: 110 }}
            value={pageSize}
            onChange={(event) => {
              setPageSize(Number(event.target.value))
              setPage(1)
            }}
          >
            <option value={15}>15 条/页</option>
            <option value={30}>30 条/页</option>
            <option value={50}>50 条/页</option>
          </select>
        </div>
      </div>
    </PageLayout>
  )
}


























