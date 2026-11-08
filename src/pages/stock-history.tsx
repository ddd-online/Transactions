import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import { milliToYuan } from '../../shared/domain/money'
import type {
  StockTradeDto,
  StockTradeHistoryDetailDto,
  StockTradeHistoryDto,
  StockTradeHistorySummaryDto,
} from '../../shared/types/stock-history'
import type { StockTradeTagSettingDto } from '../../shared/types/stock'
import { ConfirmDialog } from '../components/confirm-dialog'
import { notify } from '../components/toast'
import { StockHistoryList } from './stock-history-list'
import { StockRoundDetail } from './stock-round-detail'
import { stockErrorMessage } from './stock-format'

export interface StockHistoryPanelProps {
  ledgerId: string
  onSummaryChange?: (summary: StockTradeHistorySummaryDto | null) => void
  /** 从心得跳过来时，选中股票并展开指定的一轮 */
  jumpTarget?: { code: string; roundId: string; token: number } | null
  /** 从某一轮直接记一条心得 */
  onCreateLesson?: (roundId: string) => void
}

export function StockHistoryPanel({
  ledgerId,
  onSummaryChange,
  jumpTarget,
  onCreateLesson,
}: StockHistoryPanelProps): JSX.Element {
  const [rows, setRows] = useState<StockTradeHistoryDto[]>([])
  const [selectedCode, setSelectedCode] = useState('')
  const [arrivedRoundId, setArrivedRoundId] = useState('')
  const consumedJump = useRef(0)
  const [detail, setDetail] = useState<StockTradeHistoryDetailDto | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [roundTags, setRoundTags] = useState<Record<string, string>>({})
  const [roundTemplate, setRoundTemplate] = useState('')
  const [tagOptions, setTagOptions] = useState<string[]>([])
  const [edits, setEdits] = useState<Record<string, { price: string; lots: string }>>({})
  const [confirmOrder, setConfirmOrder] = useState<string | null>(null)
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setRows([])
      onSummaryChange?.(null)
      setDetail(null)
      return
    }
    try {
      const [list, total] = await Promise.all([
        window.api.invoke('stock_history', { ledger_id: ledgerId }),
        window.api.invoke('stock_history_summary', { ledger_id: ledgerId }),
      ])
      setRows(list)
      onSummaryChange?.(total)
      setError('')
    } catch (loadError) {
      setError(stockErrorMessage(loadError))
    }
  }, [ledgerId, onSummaryChange])

  useEffect(() => {
    void load()
  }, [load])

  const openDetail = useCallback(
    async (code: string, focusRoundId = ''): Promise<void> => {
      if (!code) return
      setError('')
      setSelectedCode(code)
      try {
        const [next, reviewSettings] = await Promise.all([
          window.api.invoke('stock_history_detail', {
            ledger_id: ledgerId,
            stock_code: code,
          }),
          window.api.invoke('stock_review_template_get', { ledger_id: ledgerId }),
        ])
        setDetail(next)
        setRoundTemplate(reviewSettings.template)
        setRoundTags(Object.fromEntries(next.rounds.map((round) => [round.id, round.tag])))
        // 从心得跳转时展开指定的那一轮；否则展开最新一轮（轮次最大）。
        const focus = focusRoundId
          ? next.rounds.find((round) => round.id === focusRoundId)
          : undefined
        const latestRoundNo = next.rounds.reduce(
          (latest, round) => Math.max(latest, round.roundNo),
          -Infinity,
        )
        setExpanded(
          Object.fromEntries(
            next.rounds.map((round) => [
              round.id,
              focus ? round.id === focus.id : round.roundNo === latestRoundNo,
            ]),
          ),
        )
        setArrivedRoundId(focus?.id ?? '')
        setEdits(
          Object.fromEntries(
            next.rounds
              .flatMap((round) => round.trades)
              .map((trade) => [trade.id, { price: milliToYuan(trade.price), lots: String(trade.lots) }]),
          ),
        )
        const settings: StockTradeTagSettingDto = await window.api.invoke('stock_tag_settings_get', {
          ledger_id: ledgerId,
        })
        setTagOptions(settings.tags)
      } catch (detailError) {
        setError(stockErrorMessage(detailError))
      }
    },
    [ledgerId],
  )

  /** 名称刷新回来：左栏与详情头就地改名，不重拉（重拉会把展开的轮次与滚动位置一起洗掉）。 */
  const renameStock = useCallback(
    (stockName: string): void => {
      setRows((list) =>
        list.map((row) => (row.stockCode === selectedCode ? { ...row, stockName } : row)),
      )
      setDetail((current) =>
        current && current.stockCode === selectedCode ? { ...current, stockName } : current,
      )
    },
    [selectedCode],
  )

  useEffect(() => {
    if (rows.length === 0) return
    if (jumpTarget && consumedJump.current !== jumpTarget.token) {
      consumedJump.current = jumpTarget.token
      void openDetail(jumpTarget.code, jumpTarget.roundId)
      return
    }
    if (!selectedCode) void openDetail(rows[0].stockCode)
  }, [openDetail, rows, selectedCode, jumpTarget])

  useEffect(() => {
    if (!arrivedRoundId || !detail) return
    const frame = window.requestAnimationFrame(() => {
      const node = document.querySelector(`[data-round-id="${arrivedRoundId}"]`)
      node?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    })
    const timer = window.setTimeout(() => setArrivedRoundId(''), 1600)
    return () => {
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timer)
    }
  }, [arrivedRoundId, detail])

  const saveRoundReview = useCallback(
    async (roundId: string, review: string): Promise<void> => {
      if (!detail) return
      try {
        const next = await window.api.invoke('stock_round_review', {
          ledger_id: ledgerId,
          round_id: roundId,
          review,
        })
        setDetail(next)
        notify('复盘已保存')
      } catch (reviewError) {
        notify(stockErrorMessage(reviewError), 'error')
      }
    },
    [detail, ledgerId],
  )

  const saveRoundTag = useCallback(
    async (roundId: string, tag: string): Promise<void> => {
      if (!detail) return
      try {
        const next = await window.api.invoke('stock_round_tag', {
          ledger_id: ledgerId,
          round_id: roundId,
          tag,
        })
        setDetail(next)
        setRoundTags(Object.fromEntries(next.rounds.map((round) => [round.id, round.tag])))
      } catch (tagError) {
        notify(stockErrorMessage(tagError), 'error')
      }
    },
    [detail, ledgerId],
  )

  const saveTrade = useCallback(
    async (tradeId: string): Promise<void> => {
      if (!detail) return
      const edit = edits[tradeId]
      if (!edit) return
      const trade = detail.rounds.flatMap((round) => round.trades).find((item) => item.id === tradeId)
      try {
        await window.api.invoke('stock_trade_update', {
          ledger_id: ledgerId,
          id: tradeId,
          price: Number(edit.price),
          lots: Number(edit.lots),
          trade_time: trade?.tradeTime || Math.floor(Date.now() / 1000),
        })
        await openDetail(detail.stockCode)
        notify('成交已更新')
      } catch (tradeError) {
        notify(stockErrorMessage(tradeError), 'error')
      }
    },
    [detail, edits, ledgerId, openDetail],
  )

  const deleteOrder = useCallback(async (): Promise<void> => {
    if (!confirmOrder || !detail) return
    try {
      await window.api.invoke('stock_trade_order_delete', {
        ledger_id: ledgerId,
        order_id: confirmOrder,
      })
      setConfirmOrder(null)
      await openDetail(detail.stockCode)
    } catch (deleteError) {
      notify(stockErrorMessage(deleteError), 'error')
    }
  }, [confirmOrder, detail, ledgerId, openDetail])

  const toggleRound = useCallback((roundId: string): void => {
    setExpanded((current) => ({ ...current, [roundId]: !current[roundId] }))
  }, [])

  const handleTag = useCallback(
    (roundId: string, value: string): void => {
      void saveRoundTag(roundId, value)
    },
    [saveRoundTag],
  )

  const handleSaveTrade = useCallback(
    (tradeId: string): void => {
      void saveTrade(tradeId)
    },
    [saveTrade],
  )

  const editTrade = useCallback(
    (trade: StockTradeDto, field: 'price' | 'lots', value: string): void => {
      setEdits((current) => ({
        ...current,
        [trade.id]: {
          price:
            field === 'price'
              ? value
              : current[trade.id]?.price ?? milliToYuan(trade.price),
          lots:
            field === 'lots'
              ? value
              : current[trade.id]?.lots ?? String(trade.lots),
        },
      }))
    },
    [],
  )

  return (
    <div className="stock-history-view">
      <div className="stock-history-main">
        <StockHistoryList
          ledgerId={ledgerId}
          rows={rows}
          selectedCode={selectedCode}
          onSelect={(stockCode) => void openDetail(stockCode)}
        />

        <StockRoundDetail
          ledgerId={ledgerId}
          detail={detail}
          error={error}
          expanded={expanded}
          arrivedRoundId={arrivedRoundId}
          roundTags={roundTags}
          template={roundTemplate}
          tagOptions={tagOptions}
          edits={edits}
          onCreateLesson={onCreateLesson}
          onToggle={toggleRound}
          onSaveReview={saveRoundReview}
          onTag={handleTag}
          onEdit={editTrade}
          onSaveTrade={handleSaveTrade}
          onDelete={setConfirmOrder}
          onRenamed={renameStock}
        />
      </div>

      <ConfirmDialog
        open={confirmOrder !== null}
        title="删除整笔委托"
        message="删除后持仓与资金会按重放结果回滚，确定继续？"
        confirmText="删除"
        danger
        onCancel={() => setConfirmOrder(null)}
        onConfirm={() => void deleteOrder()}
      />
    </div>
  )
}
