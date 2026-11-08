import type { JSX } from 'react'

import { Input, Modal } from 'antd'

import { planLevelsOf } from '../../shared/domain/plan-levels'
import type { StockLedgerDto } from '../../shared/types/stock-ledger'
import { Button } from '../components/button'
import { levelTone, pnlClass } from './stock-ledger-read'

/** 编辑弹窗里的台账草稿：五个字段都是用户原文，保存时才 trim。 */
export interface LedgerForm {
  whyBuy: string
  stopLoss: string
  takeProfit: string
  followedSystem: string
  summary: string
}

export const EMPTY_FORM: LedgerForm = {
  whyBuy: '',
  stopLoss: '',
  takeProfit: '',
  followedSystem: '',
  summary: '',
}

/** 弹窗里贴在输入框右端的百分比 —— 边填边算，不另占一行。 */
function DeltaSuffix({ text, id }: { text: string | null; id: string }): JSX.Element | null {
  if (!text) return null
  return (
    <span id={id} data-testid={id} className={`stock-ledger__delta ${levelTone(text)}`}>
      <span className="sr-only">较买入价 </span>
      {text}
    </span>
  )
}

/**
 * 算不出盈亏比时那句话：三种原因各说各的下一步，不拿「填好后自动计算」盖住已经填过的框。
 * 保本 / 移动止损是最常见的 `blocked` —— 止损就在买入价上或之上，没有可亏的空间。
 */
const RATIO_PROMPTS = {
  missing: '填好止损和止盈后自动计算',
  unreadable: '止损和止盈写成价格数字，才能算盈亏比',
  blocked: '止盈高于买入价、止损低于买入价，才有盈亏比',
} as const

/** trim 后五个字段全空返回 `null`；页面据此提示「台账至少填写一项」。 */
export function normalizeLedgerForm(form: LedgerForm): LedgerForm | null {
  const trimmed: LedgerForm = {
    whyBuy: form.whyBuy.trim(),
    stopLoss: form.stopLoss.trim(),
    takeProfit: form.takeProfit.trim(),
    followedSystem: form.followedSystem.trim(),
    summary: form.summary.trim(),
  }
  return Object.values(trimmed).every((value) => value === '') ? null : trimmed
}

export interface StockLedgerFormProps {
  open: boolean
  /** 弹窗里只读的买入 / 卖出数字来自它；还没读完时为 `null` */
  ledger: StockLedgerDto | null
  /** 已清仓（轮次 id 存在也算）：卖出价 / 净额 / 盈亏才可读 */
  closed: boolean
  form: LedgerForm
  /** 顶部与弹窗共用的错误文案：加载失败、校验失败、保存失败都落在这一处 */
  error: string
  busy: boolean
  onChange: (update: (current: LedgerForm) => LedgerForm) => void
  /** 任何字段改动时清掉残留的错误提示（校验失败 / 保存失败之后都该跟着消失） */
  onClearError: () => void
  onSave: () => void
  onClose: () => void
}

/** 台账编辑弹窗：草稿由页面持有，这里只渲染与回传改动；落库留在页面。 */
export function StockLedgerForm({
  open,
  ledger,
  closed,
  form,
  error,
  busy,
  onChange,
  onClearError,
  onSave,
  onClose,
}: StockLedgerFormProps): JSX.Element {
  // 三个派生数字只在这里算：入库的是用户手写的止损 / 止盈原文，显示时才折成百分比与倍数。
  const draftLevels = planLevelsOf(ledger?.buyPrice ?? '', form.stopLoss, form.takeProfit)
  const ratio = draftLevels.riskReward
  const stopLabelId = 'stock-ledger-stop-label'
  const takeLabelId = 'stock-ledger-take-label'
  const stopDeltaId = 'stock-ledger-stop-delta'
  const takeDeltaId = 'stock-ledger-take-delta'

  /**
   * 改任何一个字段都清掉残留的错误提示。
   *
   * 原来只有「为什么买」清：校验失败（「台账至少填写一项」）或保存失败之后，改止损 / 止盈
   * 那几个框，红字还挂在那儿，像是这次输入仍然不合法。
   */
  const change = (update: (current: LedgerForm) => LedgerForm): void => {
    onChange(update)
    onClearError()
  }

  return (
    <Modal
      open={open}
      title={ledger?.exists ? '编辑台账' : '填写台账'}
      width={680}
      centered
      destroyOnHidden
      footer={null}
      onCancel={onClose}
    >
      <div className="stock-modal-form stock-ledger-form" data-testid="stock-ledger-dialog">
        <label>
          <span className="stock-label">为什么买</span>
          <Input.TextArea
            data-testid="stock-ledger-why"
            rows={4}
            maxLength={2000}
            placeholder="当时为什么决定买这一轮"
            value={form.whyBuy}
            onChange={(event) => change((current) => ({ ...current, whyBuy: event.target.value }))}
          />
        </label>

        <div className="stock-modal-grid">
          <label>
            <span className="stock-label">买入价</span>
            <Input
              className="stock-ledger__computed"
              data-testid="stock-ledger-buy-price"
              readOnly
              value={ledger?.buyPrice ?? ''}
              placeholder="按成交自动计算"
            />
          </label>
          <label>
            <span className="stock-label">买入成本</span>
            <Input
              className="stock-ledger__computed"
              data-testid="stock-ledger-buy-cost"
              readOnly
              value={ledger?.buyCost ?? ''}
              placeholder="按成交自动计算"
            />
          </label>
          <label>
            <span className="stock-label" id={stopLabelId}>
              止损
            </span>
            <Input
              data-testid="stock-ledger-stop"
              maxLength={200}
              placeholder="例如：9.00"
              aria-labelledby={stopLabelId}
              aria-describedby={draftLevels.downside ? stopDeltaId : undefined}
              suffix={<DeltaSuffix text={draftLevels.downside} id={stopDeltaId} />}
              value={form.stopLoss}
              onChange={(event) =>
                change((current) => ({ ...current, stopLoss: event.target.value }))
              }
            />
          </label>
          <label>
            <span className="stock-label" id={takeLabelId}>
              止盈
            </span>
            <Input
              data-testid="stock-ledger-take"
              maxLength={200}
              placeholder="例如：12.00"
              aria-labelledby={takeLabelId}
              aria-describedby={draftLevels.upside ? takeDeltaId : undefined}
              suffix={<DeltaSuffix text={draftLevels.upside} id={takeDeltaId} />}
              value={form.takeProfit}
              onChange={(event) =>
                change((current) => ({ ...current, takeProfit: event.target.value }))
              }
            />
          </label>
          <div className="stock-ledger-form__ratio" data-testid="stock-ledger-form-ratio">
            <span className="stock-ledger-form__ratio-label">盈亏比</span>
            {ratio.kind === 'value' ? (
              <span className="stock-ledger-form__ratio-value">{ratio.text}</span>
            ) : (
              <span className="stock-ledger-form__ratio-empty">{RATIO_PROMPTS[ratio.kind]}</span>
            )}
          </div>
          <label>
            <span className="stock-label">卖出价</span>
            <Input
              className="stock-ledger__computed"
              data-testid="stock-ledger-sell-price"
              readOnly
              aria-disabled={!closed}
              value={closed ? ledger?.sellPrice ?? '' : ''}
              placeholder={closed ? '按成交自动计算' : '清仓后回填'}
            />
          </label>
          <label>
            <span className="stock-label">卖出净额</span>
            <Input
              className="stock-ledger__computed"
              data-testid="stock-ledger-sell-net"
              readOnly
              aria-disabled={!closed}
              value={closed ? ledger?.sellNet ?? '' : ''}
              placeholder={closed ? '按成交自动计算' : '清仓后回填'}
            />
          </label>
          <label>
            <span className="stock-label">净盈亏</span>
            <Input
              className={`stock-ledger__computed ${closed ? pnlClass(ledger?.netPnl ?? '') : ''}`}
              data-testid="stock-ledger-pnl"
              readOnly
              aria-disabled={!closed}
              value={closed ? ledger?.netPnl ?? '' : ''}
              placeholder={closed ? '按成交自动计算' : '清仓后回填'}
            />
          </label>
        </div>

        <label>
          <span className="stock-label">是否按系统执行</span>
          <Input
            data-testid="stock-ledger-followed"
            maxLength={200}
            placeholder="例如：是 / 否 / 部分"
            value={form.followedSystem}
            onChange={(event) =>
              change((current) => ({ ...current, followedSystem: event.target.value }))
            }
          />
        </label>
        <label>
          <span className="stock-label">一句话</span>
          <Input
            data-testid="stock-ledger-summary"
            maxLength={2000}
            placeholder="一句话总结这一轮"
            value={form.summary}
            onChange={(event) => change((current) => ({ ...current, summary: event.target.value }))}
          />
        </label>

        {error ? (
          <p role="alert" className="stock-modal-error" data-testid="stock-ledger-form-error">
            {error}
          </p>
        ) : null}
        <div className="stock-modal-actions">
          <Button variant="secondary" onClick={onClose}>
            取消
          </Button>
          <Button variant="primary" testId="stock-ledger-save" loading={busy} onClick={onSave}>
            保存
          </Button>
        </div>
      </div>
    </Modal>
  )
}
