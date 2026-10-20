import { useCallback, useEffect, useState, type JSX } from 'react'

import { centsToYuan, yuanToCents } from '../../shared/domain/money'
import { formatTimestamp } from '../../shared/domain/time'
import type {
  TransactionRecordDto,
  TrQueryCondition,
  TrQueryResult,
} from '../../shared/types/transaction'

const PAGE_SIZE = 20

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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const [amount, setAmount] = useState('')
  const [type, setType] = useState('expense')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [tags, setTags] = useState('')

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
        offset: (page - 1) * PAGE_SIZE,
        limit: PAGE_SIZE,
        tsRange: [],
        items:
          typeFilter || keyword
            ? [
                {
                  transactionType: typeFilter,
                  category: '',
                  tags: [],
                  tagPolicy: '',
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
  }, [keyword, ledgerId, page, typeFilter])

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
      await window.api.invoke('tr_create', {
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
        outlier: false,
        keyEventDate: '',
      })
      setAmount('')
      setDescription('')
      setPage(1)
      onChanged?.()
      await load()
    } catch (createError) {
      setError(errorMessage(createError))
    }
  }, [amount, category, description, ledgerId, load, onChanged, tags, type])

  const remove = useCallback(
    async (id: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('tr_delete', { id })
        onChanged?.()
        await load()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      }
    },
    [load, onChanged],
  )

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <section className="m0-card m0-card--wide">
      <div className="m0-card-head">
        <h2>记账 · 记录</h2>
        <span className="m0-muted" data-testid="tr-total">
          {total} 笔
        </span>
      </div>

      <div className="m0-actions m0-filter">
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
      </div>

      <div className="m0-actions m0-new-record">
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
          data-testid="tr-category"
          placeholder="分类"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
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
        <button
          type="button"
          className="m0-primary"
          data-testid="tr-save"
          disabled={!ledgerId || loading}
          onClick={() => void create()}
        >
          记一笔
        </button>
      </div>

      {error ? (
        <p className="m0-error" data-testid="tr-error">
          {error}
        </p>
      ) : null}

      {rows.length === 0 ? (
        <p className="m0-muted" data-testid="tr-empty">
          {ledgerId ? (loading ? '加载中…' : '还没有记录') : '请先创建/选择账本'}
        </p>
      ) : (
        <table className="m0-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>类型</th>
              <th>分类</th>
              <th>备注</th>
              <th>标签</th>
              <th className="m0-right">金额（元）</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.transactionId} data-testid="tr-row">
                <td>{formatTimestamp(row.transactionAt, 'YYYY-MM-DD')}</td>
                <td>{typeLabel(row.transactionType)}</td>
                <td>{row.category}</td>
                <td>{row.description}</td>
                <td>{row.tags.join('、')}</td>
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
              <td colSpan={5}>合计</td>
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

      <div className="m0-actions m0-pager">
        <button
          type="button"
          className="m0-link"
          data-testid="tr-prev"
          disabled={page <= 1 || loading}
          onClick={() => setPage((current) => Math.max(1, current - 1))}
        >
          上一页
        </button>
        <span className="m0-muted" data-testid="tr-page">
          {page} / {totalPages}
        </span>
        <button
          type="button"
          className="m0-link"
          data-testid="tr-next"
          disabled={page >= totalPages || loading}
          onClick={() => setPage((current) => current + 1)}
        >
          下一页
        </button>
      </div>
    </section>
  )
}
