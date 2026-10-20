import { useCallback, useEffect, useState, type JSX } from 'react'

import { centsToYuan, milliToYuan, yuanToCents } from '../../shared/domain/money'
import { todayYmd } from '../../shared/domain/time'
import type {
  StockAccountSummary,
  StockFundRecordPage,
  StockTradeTagSettingDto,
} from '../../shared/types/stock'
import type { StockOverviewDto, StockPositionDto } from '../../shared/types/stock-position'
import type { StockOperationDto } from '../../shared/types/stock'
import { ConfirmDialog } from '../components/confirm-dialog'
import { notify } from '../components/toast'
import { EmptyState } from '../components/empty-state'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function money(cents: number): string {
  return `¥${centsToYuan(cents)}`
}

export interface StockAccountPanelProps {
  ledgerId: string
  onLedgerChanged?: () => void
}

export function StockAccountPanel({
  ledgerId,
  onLedgerChanged,
}: StockAccountPanelProps): JSX.Element {
  const [summary, setSummary] = useState<StockAccountSummary | null>(null)
  const [tags, setTags] = useState<StockTradeTagSettingDto | null>(null)
  const [funds, setFunds] = useState<StockFundRecordPage | null>(null)
  const [overview, setOverview] = useState<StockOverviewDto | null>(null)
  const [positions, setPositions] = useState<StockPositionDto[]>([])
  const [operations, setOperations] = useState<StockOperationDto[]>([])
  const [archiveName, setArchiveName] = useState('')
  const [transferStatus, setTransferStatus] = useState('')
  const [reviewCode, setReviewCode] = useState('')
  const [reviewDate, setReviewDate] = useState(todayYmd())
  const [reviewText, setReviewText] = useState('')
  const [confirmReset, setConfirmReset] = useState(false)
  const [amount, setAmount] = useState('')
  const [tradeForm, setTradeForm] = useState({
    tradeType: 'open',
    code: '',
    name: '',
    price: '',
    lots: '1',
    tag: '分析',
  })
  const [feeForm, setFeeForm] = useState({
    commissionRate: '',
    minCommission: '',
    stampDutyRate: '',
    transferFeeRate: '',
  })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setSummary(null)
      return
    }
    try {
      const [account, settings, tagSettings, page, overviewData, positionRows, operationRows] =
        await Promise.all([
        window.api.invoke('stock_account_summary', { ledger_id: ledgerId }),
        window.api.invoke('stock_fee_settings_get', { ledger_id: ledgerId }),
        window.api.invoke('stock_tag_settings_get', { ledger_id: ledgerId }),
        window.api.invoke('stock_fund_records', { ledger_id: ledgerId, page: 1, pageSize: 20 }),
        window.api.invoke('stock_overview', { ledger_id: ledgerId }),
          window.api.invoke('stock_positions', { ledger_id: ledgerId }),
          window.api.invoke('stock_operation_list', { ledger_id: ledgerId }),
        ])
      setSummary(account)
      setTags(tagSettings)
      setFunds(page)
      setOverview(overviewData)
      setPositions(positionRows)
      setOperations(operationRows)
      setFeeForm({
        commissionRate: String(settings.commissionRate),
        minCommission: centsToYuan(settings.minCommission),
        stampDutyRate: String(settings.stampDutyRate),
        transferFeeRate: String(settings.transferFeeRate),
      })
      setError('')
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [ledgerId])

  useEffect(() => {
    void load()
  }, [load])

  const runAccount = useCallback(
    async (command: 'stock_principal_add' | 'stock_withdraw' | 'stock_interest_add') => {
      setBusy(true)
      setError('')
      try {
        const cents = yuanToCents(amount)
        await window.api.invoke(command, { ledger_id: ledgerId, amount: cents, date: '' })
        setAmount('')
        await load()
      } catch (accountError) {
        setError(errorMessage(accountError))
      } finally {
        setBusy(false)
      }
    },
    [amount, ledgerId, load],
  )

  const createTrade = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await window.api.invoke('stock_trade_create', {
        ledger_id: ledgerId,
        stock_code: tradeForm.code.trim(),
        stock_name: tradeForm.name.trim(),
        trade_type: tradeForm.tradeType,
        trade_time: Math.floor(Date.now() / 1000),
        remark: '',
        tag: tradeForm.tag,
        fills: [{ price: Number(tradeForm.price), lots: Number(tradeForm.lots) }],
        price: 0,
        lots: 0,
      })
      setTradeForm((current) => ({ ...current, price: '' }))
      await load()
    } catch (tradeError) {
      setError(errorMessage(tradeError))
    } finally {
      setBusy(false)
    }
  }, [ledgerId, load, tradeForm])

  const saveFees = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await window.api.invoke('stock_fee_settings_put', {
        ledger_id: ledgerId,
        commission_rate: Number(feeForm.commissionRate),
        min_commission: yuanToCents(feeForm.minCommission),
        stamp_duty_rate: Number(feeForm.stampDutyRate),
        transfer_fee_rate: Number(feeForm.transferFeeRate),
      })
      setError('')
    } catch (feeError) {
      setError(errorMessage(feeError))
    } finally {
      setBusy(false)
    }
  }, [feeForm, ledgerId])

  const openReview = useCallback((code: string, rows: Array<{ date: string; review: string }>): void => {
    const today = todayYmd()
    setReviewCode(code)
    setReviewDate(today)
    setReviewText(rows.find((row) => row.date === today)?.review ?? '')
  }, [])

  const saveReview = useCallback(async (): Promise<void> => {
    if (!reviewCode) return
    setError('')
    try {
      const rows = await window.api.invoke('stock_day_review', {
        ledger_id: ledgerId,
        code: reviewCode,
        date: reviewDate,
        review: reviewText,
      })
      setReviewText(rows.find((row) => row.date === reviewDate)?.review ?? '')
      await load()
    } catch (reviewError) {
      setError(errorMessage(reviewError))
    }
  }, [ledgerId, load, reviewCode, reviewDate, reviewText])

  const rollbackOperation = useCallback(async (): Promise<void> => {
    setError('')
    try {
      const result = await window.api.invoke('stock_operation_rollback', { ledger_id: ledgerId })
      setTransferStatus(
        result.skipped ? `目标已不存在，已移除记录：${result.action}` : `已回滚：${result.action}`,
      )
      notify('操作已回滚')
      await load()
    } catch (rollbackError) {
      setError(errorMessage(rollbackError))
    }
  }, [ledgerId, load])

  const resetStock = useCallback(async (): Promise<void> => {
    setError('')
    try {
      await window.api.invoke('stock_reset', { ledger_id: ledgerId })
      setTransferStatus('股票数据已重置')
      notify('股票数据已重置')
      await load()
    } catch (resetError) {
      setError(errorMessage(resetError))
    }
  }, [ledgerId, load])

  const archiveStock = useCallback(async (): Promise<void> => {
    if (!archiveName.trim()) {
      setError('请输入归档账本名称')
      return
    }
    setError('')
    try {
      await window.api.invoke('stock_archive', {
        ledger_id: ledgerId,
        name: archiveName.trim(),
      })
      setArchiveName('')
      setTransferStatus('股票数据已归档到新账本')
      notify('股票数据已归档')
      onLedgerChanged?.()
      await load()
    } catch (archiveError) {
      setError(errorMessage(archiveError))
    }
  }, [archiveName, ledgerId, load, onLedgerChanged])

  return (
    <section className="m0-card m0-card--wide">
      <div className="m0-card-head">
        <h2>股票 · 账户与设置</h2>
        <span className="m0-muted" data-testid="stock-tags">
          {tags ? tags.tags.join(' / ') : ''}
        </span>
      </div>

      <div className="m0-stats m0-stock-stats">
        <div className="m0-stat">
          <span className="m0-muted">本金</span>
          <strong data-testid="stock-principal">{money(summary?.principal ?? 0)}</strong>
        </div>
        <div className="m0-stat">
          <span className="m0-muted">可用现金</span>
          <strong data-testid="stock-cash">{money(summary?.availableCash ?? 0)}</strong>
        </div>
        <div className="m0-stat">
          <span className="m0-muted">持仓成本</span>
          <strong data-testid="stock-position-cost">{money(summary?.positionCost ?? 0)}</strong>
        </div>
        <div className="m0-stat">
          <span className="m0-muted">累计支取 / 利息</span>
          <strong data-testid="stock-withdrawn">
            {money(summary?.withdrawnTotal ?? 0)} / {money(summary?.interestTotal ?? 0)}
          </strong>
        </div>
      </div>

      <div className="m0-actions m0-new-record">
        <input
          className="m0-input"
          data-testid="stock-amount"
          inputMode="decimal"
          placeholder="金额（元）"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
        <button
          type="button"
          className="m0-primary"
          data-testid="stock-add-principal"
          disabled={!ledgerId || busy}
          onClick={() => void runAccount('stock_principal_add')}
        >
          追加本金
        </button>
        <button
          type="button"
          className="m0-link"
          data-testid="stock-withdraw"
          disabled={!ledgerId || busy}
          onClick={() => void runAccount('stock_withdraw')}
        >
          支取
        </button>
        <button
          type="button"
          className="m0-link"
          data-testid="stock-interest"
          disabled={!ledgerId || busy}
          onClick={() => void runAccount('stock_interest_add')}
        >
          利息归本
        </button>
      </div>

      {error ? (
        <p className="m0-error" data-testid="stock-error">
          {error}
        </p>
      ) : null}

      <div className="m0-stats m0-stock-stats">
        <div className="m0-stat">
          <span className="m0-muted">总资产</span>
          <strong data-testid="stock-total-assets">{money(overview?.totalAssets ?? 0)}</strong>
        </div>
        <div className="m0-stat">
          <span className="m0-muted">持仓市值</span>
          <strong>{money(overview?.positionMarketValue ?? 0)}</strong>
        </div>
        <div className="m0-stat">
          <span className="m0-muted">已实现 / 浮动</span>
          <strong>
            {money(overview?.realizedPnl ?? 0)} / {money(overview?.unrealizedPnl ?? 0)}
          </strong>
        </div>
        <div className="m0-stat">
          <span className="m0-muted">总盈亏 / 仓位</span>
          <strong>
            {(overview?.totalPnlPercent ?? 0).toFixed(2)}% /{' '}
            {overview?.positionRatio == null ? '—' : `${overview.positionRatio.toFixed(2)}%`}
          </strong>
        </div>
      </div>

      <h3 className="m0-subtitle">持仓</h3>
      {positions.length > 0 ? (
        <table className="m0-table">
          <thead>
            <tr>
              <th>股票</th>
              <th className="m0-right">数量</th>
              <th className="m0-right">成本</th>
              <th className="m0-right">最新价</th>
              <th className="m0-right">已实现</th>
              <th>标签</th>
              <th>建仓日</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {positions.map((row) => (
              <tr key={row.id} data-testid="stock-position-row">
                <td>
                  {row.stockName} {row.stockCode}
                </td>
                <td className="m0-right">{row.quantity}</td>
                <td className="m0-right">{money(row.totalCost)}</td>
                <td className="m0-right">
                  {row.latestPrice === undefined ? '—' : milliToYuan(row.latestPrice)}
                </td>
                <td className="m0-right">{money(row.realizedPnl)}</td>
                <td>{row.tag}</td>
                <td>{row.roundOpenedDate}</td>
                <td className="m0-right">
                  <button
                    type="button"
                    className="m0-link"
                    data-testid="position-review-open"
                    onClick={() => openReview(row.stockCode, row.dayReviews)}
                  >
                    写复盘
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState
          testId="stock-position-empty"
          title={ledgerId ? '当前没有持仓' : '请先创建/选择账本'}
        />
      )}

      {reviewCode ? (
        <div className="m0-stock-review">
          <h3 className="m0-subtitle">{reviewCode} · 每日复盘</h3>
          <div className="m0-actions">
            <input
              className="m0-input"
              type="date"
              data-testid="position-review-date"
              value={reviewDate}
              onChange={(event) => {
                setReviewDate(event.target.value)
                const position = positions.find((row) => row.stockCode === reviewCode)
                setReviewText(
                  position?.dayReviews.find((row) => row.date === event.target.value)?.review ?? '',
                )
              }}
            />
            <textarea
              className="m0-input m0-round-review"
              data-testid="position-review-text"
              placeholder="当天观察"
              value={reviewText}
              onChange={(event) => setReviewText(event.target.value)}
            />
            <button
              type="button"
              className="m0-primary"
              data-testid="position-review-save"
              onClick={() => void saveReview()}
            >
              保存复盘
            </button>
            <button
              type="button"
              className="m0-link"
              onClick={() => setReviewCode('')}
            >
              关闭
            </button>
          </div>
        </div>
      ) : null}

      <h3 className="m0-subtitle">记一笔股票交易</h3>
      <div className="m0-actions m0-new-record">
        <select
          className="m0-input"
          data-testid="trade-type"
          value={tradeForm.tradeType}
          onChange={(event) =>
            setTradeForm((current) => ({ ...current, tradeType: event.target.value }))
          }
        >
          <option value="open">建仓</option>
          <option value="add">加仓</option>
          <option value="reduce">减仓</option>
          <option value="close">清仓</option>
        </select>
        <input
          className="m0-input"
          data-testid="trade-code"
          placeholder="代码"
          value={tradeForm.code}
          onChange={(event) =>
            setTradeForm((current) => ({ ...current, code: event.target.value }))
          }
        />
        <input
          className="m0-input"
          data-testid="trade-name"
          placeholder="名称"
          value={tradeForm.name}
          onChange={(event) =>
            setTradeForm((current) => ({ ...current, name: event.target.value }))
          }
        />
        <input
          className="m0-input"
          data-testid="trade-price"
          inputMode="decimal"
          placeholder="价格（元）"
          value={tradeForm.price}
          onChange={(event) =>
            setTradeForm((current) => ({ ...current, price: event.target.value }))
          }
        />
        <input
          className="m0-input"
          data-testid="trade-lots"
          inputMode="numeric"
          placeholder="手数"
          value={tradeForm.lots}
          onChange={(event) =>
            setTradeForm((current) => ({ ...current, lots: event.target.value }))
          }
        />
        <input
          className="m0-input"
          data-testid="trade-tag"
          placeholder="标签"
          value={tradeForm.tag}
          onChange={(event) =>
            setTradeForm((current) => ({ ...current, tag: event.target.value }))
          }
        />
        <button
          type="button"
          className="m0-primary"
          data-testid="trade-save"
          disabled={!ledgerId || busy}
          onClick={() => void createTrade()}
        >
          记一笔
        </button>
      </div>

      <h3 className="m0-subtitle">交易费用</h3>
      <div className="m0-actions m0-new-record">
        <label className="m0-field">
          佣金费率
          <input
            className="m0-input"
            data-testid="fee-commission"
            value={feeForm.commissionRate}
            onChange={(event) =>
              setFeeForm((current) => ({ ...current, commissionRate: event.target.value }))
            }
          />
        </label>
        <label className="m0-field">
          最低佣金（元）
          <input
            className="m0-input"
            data-testid="fee-min"
            value={feeForm.minCommission}
            onChange={(event) =>
              setFeeForm((current) => ({ ...current, minCommission: event.target.value }))
            }
          />
        </label>
        <label className="m0-field">
          印花税
          <input
            className="m0-input"
            data-testid="fee-stamp"
            value={feeForm.stampDutyRate}
            onChange={(event) =>
              setFeeForm((current) => ({ ...current, stampDutyRate: event.target.value }))
            }
          />
        </label>
        <label className="m0-field">
          过户费
          <input
            className="m0-input"
            data-testid="fee-transfer"
            value={feeForm.transferFeeRate}
            onChange={(event) =>
              setFeeForm((current) => ({ ...current, transferFeeRate: event.target.value }))
            }
          />
        </label>
        <button
          type="button"
          className="m0-primary"
          data-testid="fee-save"
          disabled={!ledgerId || busy}
          onClick={() => void saveFees()}
        >
          保存费用
        </button>
      </div>

      <h3 className="m0-subtitle">资金记录</h3>
      {funds && funds.items.length > 0 ? (
        <table className="m0-table">
          <thead>
            <tr>
              <th>日期</th>
              <th>事件</th>
              <th>备注</th>
              <th className="m0-right">变动</th>
              <th className="m0-right">余额</th>
            </tr>
          </thead>
          <tbody>
            {funds.items.map((row) => (
              <tr key={row.id} data-testid="fund-row">
                <td>{row.recordDate}</td>
                <td>{row.eventText}</td>
                <td>{row.remark}</td>
                <td className="m0-right">{money(row.amountChange)}</td>
                <td className="m0-right">{money(row.cashBalance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState
          testId="fund-empty"
          title={ledgerId ? '还没有资金记录' : '请先创建/选择账本'}
        />
      )}

      <h3 className="m0-subtitle">操作记录</h3>
      {operations.length === 0 ? (
        <p className="m0-muted" data-testid="stock-operation-empty">
          还没有可回滚的操作
        </p>
      ) : (
        <>
          <ul className="m0-tag-list">
            {operations.map((operation) => (
              <li key={operation.id} data-testid="stock-operation">
                <span>{operation.action}</span>
                <span className="m0-muted">{operation.detail}</span>
              </li>
            ))}
          </ul>
          <div className="m0-actions">
            <button
              type="button"
              className="m0-link"
              data-testid="stock-operation-rollback"
              onClick={() => void rollbackOperation()}
            >
              回滚最近一步
            </button>
          </div>
        </>
      )}

      <h3 className="m0-subtitle">重置与归档</h3>
      <div className="m0-import-row">
        <label className="m0-field m0-import-field">
          归档到新账本
          <input
            className="m0-input"
            data-testid="stock-archive-name"
            placeholder="新账本名称"
            value={archiveName}
            onChange={(event) => setArchiveName(event.target.value)}
          />
        </label>
        <button
          type="button"
          className="m0-primary"
          data-testid="stock-archive"
          onClick={() => void archiveStock()}
        >
          归档
        </button>
        <button
          type="button"
          className="m0-link"
          data-testid="stock-reset"
          onClick={() => setConfirmReset(true)}
        >
          重置全部股票数据
        </button>
      </div>
      {transferStatus ? (
        <p className="m0-muted" data-testid="stock-transfer-status">
          {transferStatus}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmReset}
        title="重置股票数据"
        message="确定清空该账本的全部股票数据？此操作不可撤销。"
        confirmText="重置"
        danger
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          setConfirmReset(false)
          void resetStock()
        }}
      />
    </section>
  )
}
















