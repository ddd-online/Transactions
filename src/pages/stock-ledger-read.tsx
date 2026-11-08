import type { JSX, ReactNode } from 'react'

import type { PlanLevels } from '../../shared/domain/plan-levels'
import type { StockLedgerDto } from '../../shared/types/stock-ledger'

/** 金额涨跌色：`¥0.00` 与空串不上色，负数是跌（绿）、其余是涨（红）。 */
export function pnlClass(value: string): string {
  if (!value || value === '¥0.00') return ''
  return value.startsWith('¥-') ? 'is-down' : 'is-up'
}

/** 百分比 / 盈亏比的涨跌色：正数红（涨）、负数绿（跌）、零不上色。 */
export function levelTone(text: string): string {
  if (text.startsWith('+')) return 'is-up'
  if (text.startsWith('-')) return 'is-down'
  return ''
}

/** 只读台账里贴在价位右边的落差：「9  较买入价 -3.30%」—— 和价格同一行，不另占一行。 */
function PlanDelta({ text, testId }: { text: string | null; testId: string }): JSX.Element | null {
  if (!text) return null
  return (
    <span className="stock-ledger__delta-note" data-testid={testId}>
      <span className="stock-ledger__delta-note-label">较买入价</span>
      <span className={`stock-ledger__delta-note-value ${levelTone(text)}`}>{text}</span>
    </span>
  )
}

function Field({
  label,
  value,
  wide = false,
  mono = false,
  muted = false,
  tone = '',
  aside,
  testId,
}: {
  label: string
  value: string
  wide?: boolean
  mono?: boolean
  muted?: boolean
  tone?: string
  /** 跟在数字右边的那一小段（止损 / 止盈的落差），与价位同一行 */
  aside?: ReactNode
  testId?: string
}): JSX.Element {
  return (
    <div className={`stock-ledger__field${wide ? ' stock-ledger__field--wide' : ''}`}>
      <span className="stock-label">{label}</span>
      <p
        className={`stock-ledger__value${mono ? ' stock-mono' : ''}${muted ? ' stock-ledger__value--muted' : ''}${tone ? ` ${tone}` : ''}`}
        data-testid={testId}
      >
        <span>{value || '—'}</span>
        {aside}
      </p>
    </div>
  )
}

export interface StockLedgerReadProps {
  /** 台账还没读完时仍不知道有没有；读完但没有台账时为 `null` 或 `exists: false` */
  ledger: StockLedgerDto | null
  loaded: boolean
  /** 已清仓（轮次 id 存在也算）：卖出价 / 净额 / 盈亏才显示实数 */
  closed: boolean
  /** 买入价 / 止损 / 止盈折出来的百分比与盈亏比 */
  levels: PlanLevels
}

/** 只读台账：买入计划、清仓结果、执行复盘三组；编辑走弹窗（`stock-ledger-form`）。 */
export function StockLedgerRead({
  ledger,
  loaded,
  closed,
  levels,
}: StockLedgerReadProps): JSX.Element {
  if (!loaded) {
    return <p className="stock-ledger__empty">正在读取台账…</p>
  }

  if (!ledger?.exists) {
    return (
      <p className="stock-ledger__empty">
        还没有台账。把买入理由、止损止盈和一句总结记在这里。
      </p>
    )
  }

  return (
    <div className="stock-ledger__sheet">
      <div className="stock-ledger__group">
        <span className="stock-ledger__group-label">买入计划</span>
        <Field label="为什么买" value={ledger.whyBuy} wide />
        <div className="stock-ledger__row stock-ledger__row--plan">
          <Field label="买入价" value={ledger.buyPrice} mono />
          <Field label="买入成本" value={ledger.buyCost} mono />
          <Field
            label="止损"
            value={ledger.stopLoss}
            aside={<PlanDelta text={levels.downside} testId="stock-ledger-plan-stop" />}
          />
          <Field
            label="止盈"
            value={ledger.takeProfit}
            aside={<PlanDelta text={levels.upside} testId="stock-ledger-plan-take" />}
          />
          <Field
            label="盈亏比"
            value={levels.riskReward.kind === 'value' ? levels.riskReward.text : ''}
            mono
            testId="stock-ledger-ratio"
          />
        </div>
      </div>

      <div className="stock-ledger__group">
        <span className="stock-ledger__group-label">清仓结果</span>
        <div className="stock-ledger__row stock-ledger__row--sell">
          <Field
            label="卖出价"
            value={closed ? ledger.sellPrice : '清仓后回填'}
            mono={closed}
            muted={!closed}
          />
          <Field
            label="卖出净额"
            value={closed ? ledger.sellNet : '清仓后回填'}
            mono={closed}
            muted={!closed}
          />
          <Field
            label="净盈亏"
            value={closed ? ledger.netPnl : '清仓后回填'}
            mono={closed}
            muted={!closed}
            tone={closed ? pnlClass(ledger.netPnl) : ''}
          />
        </div>
      </div>

      <div className="stock-ledger__group">
        <span className="stock-ledger__group-label">执行复盘</span>
        <div className="stock-ledger__execution">
          <Field label="是否按系统执行" value={ledger.followedSystem} />
          <Field label="一句话" value={ledger.summary} />
        </div>
      </div>
    </div>
  )
}
