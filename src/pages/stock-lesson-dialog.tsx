import { useEffect, useState, type JSX } from 'react'

import { Input, Modal, Select } from 'antd'

import { STOCK_LESSON_TEXT_MAX } from '../../shared/domain/consts'
import { formatTimestamp } from '../../shared/domain/time'
import type { StockLessonDto, StockRoundOptionDto } from '../../shared/types/stock-lesson'
import { Button } from '../components/button'
import { stockErrorMessage, stockMoney, stockPercent } from './stock-format'

export interface StockLessonDialogProps {
  open: boolean
  ledgerId: string
  /** 编辑时传入原心得；新建为 null */
  lesson: StockLessonDto | null
  /** 从记录页某一轮进入时预选该轮 */
  initialRoundId: string
  onCancel: () => void
  onSaved: () => void
}

function stockTitle(name: string, code: string): string {
  return name && name !== code ? `${name} ${code}` : code
}

function roundLabel(option: StockRoundOptionDto): string {
  const range = `${formatTimestamp(option.openedAt, 'MM-DD')} → ${formatTimestamp(option.closedAt, 'MM-DD')}`
  return `${stockTitle(option.stockName, option.stockCode)} · 第 ${option.roundNo} 轮 · ${range} · ${stockMoney(option.pnl)} · ${stockPercent(option.pnlRate)}`
}

/** 新建 / 编辑股票心得：一句话 + 可选关联一轮已清仓交易。 */
export function StockLessonDialog({
  open,
  ledgerId,
  lesson,
  initialRoundId,
  onCancel,
  onSaved,
}: StockLessonDialogProps): JSX.Element {
  const [text, setText] = useState('')
  const [roundId, setRoundId] = useState('')
  const [options, setOptions] = useState<StockRoundOptionDto[]>([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [sourceMissing, setSourceMissing] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    const sourceId = lesson?.roundId ?? initialRoundId ?? ''
    setText(lesson?.text ?? '')
    setRoundId(sourceId)
    setOptions([])
    setOptionsLoading(false)
    setSourceMissing(false)
    setError('')
    setBusy(false)
    if (!ledgerId) return

    let alive = true
    setOptionsLoading(true)
    window.api
      .invoke('stock_round_options', { ledger_id: ledgerId })
      .then((rows) => {
        if (!alive) return
        setOptions(rows)
        if (sourceId && !rows.some((row) => row.roundId === sourceId)) {
          setRoundId('')
          setSourceMissing(true)
        }
      })
      .catch((loadError) => {
        if (alive) setError(stockErrorMessage(loadError))
      })
      .finally(() => {
        if (alive) setOptionsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [open, ledgerId, lesson?.id, lesson?.roundId, lesson?.text, initialRoundId])

  const save = async (): Promise<void> => {
    const value = text.trim()
    if (!value) {
      setError('写一句心得再保存')
      return
    }
    setBusy(true)
    setError('')
    try {
      if (lesson) {
        await window.api.invoke('stock_lesson_update', {
          ledger_id: ledgerId,
          id: lesson.id,
          text: value,
          round_id: roundId || null,
        })
      } else {
        await window.api.invoke('stock_lesson_create', {
          ledger_id: ledgerId,
          text: value,
          round_id: roundId || null,
        })
      }
      onSaved()
    } catch (saveError) {
      setError(stockErrorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={lesson ? '编辑心得' : '新建心得'}
      width={560}
      centered
      destroyOnHidden
      footer={null}
      onCancel={onCancel}
    >
      <div className="stock-modal-form stock-lesson-dialog" data-testid="stock-lesson-dialog">
        <label>
          <span className="stock-label">心得</span>
          <Input
            autoFocus
            data-testid="stock-lesson-text"
            maxLength={STOCK_LESSON_TEXT_MAX}
            showCount
            placeholder="一句话写清楚这次做对了什么，或做错了什么。"
            value={text}
            onChange={(event) => {
              setText(event.target.value)
              setError('')
            }}
            onPressEnter={() => void save()}
          />
        </label>
        <label>
          <span className="stock-label">关联交易轮次</span>
          <Select
            data-testid="stock-lesson-round"
            allowClear
            showSearch
            optionFilterProp="label"
            loading={optionsLoading}
            placeholder={
              options.length === 0 && !optionsLoading ? '还没有已完成的交易轮次' : '不关联（可选）'
            }
            value={roundId || undefined}
            options={options.map((option) => ({
              value: option.roundId,
              label: roundLabel(option),
            }))}
            onChange={(value) => {
              setRoundId(value ?? '')
              setSourceMissing(false)
            }}
          />
        </label>
        <p className="stock-lesson-dialog__hint">
          关联后，行尾的跳转可以直接回到那一轮交易；也可以先保存，之后再补关联。
        </p>
        {sourceMissing ? (
          <p className="stock-lesson-dialog__hint is-warning">
            原关联的交易轮次已被删除，保存将解除关联。
          </p>
        ) : null}
        {error ? (
          <p className="stock-modal-error" data-testid="stock-lesson-error">
            {error}
          </p>
        ) : null}
        <div className="stock-modal-actions">
          <Button variant="secondary" onClick={onCancel}>
            取消
          </Button>
          <Button
            variant="primary"
            testId="stock-lesson-save"
            loading={busy}
            onClick={() => void save()}
          >
            保存
          </Button>
        </div>
      </div>
    </Modal>
  )
}
