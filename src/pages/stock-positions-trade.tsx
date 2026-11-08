import type { JSX } from 'react'

import { Input, Modal, Select } from 'antd'

import { computeOrderFee, instrumentOf } from '../../shared/domain/fee'
import { todayYmd } from '../../shared/domain/time'
import type { StockPositionDto } from '../../shared/types/stock-position'
import type { StockTradeDto } from '../../shared/types/stock-history'
import { Button } from '../components/button'
import { DatePicker } from '../components/date-picker'
import {
  feeFormOf,
  feeRatesOf,
  feeText,
  type StockFeeRates,
  type TradeFeeForm,
} from './stock-positions-fee'
import { stockMoney, stockTradeTypeLabel } from './stock-format'

export interface TradeFillForm {
  price: string
  lots: string
}

export interface TradeForm {
  type: string
  code: string
  name: string
  fills: TradeFillForm[]
  date: string
  tag: string
  remark: string
}

/** 弹窗每次打开都从这一份起头：建仓、今天、默认标签、一笔空成交。 */
export const EMPTY_TRADE: TradeForm = {
  type: 'open',
  code: '',
  name: '',
  fills: [{ price: '', lots: '' }],
  date: todayYmd(),
  tag: '分析',
  remark: '',
}

export interface StockPositionsTradeProps {
  ledgerId: string
  open: boolean
  busy: boolean
  /** 页面级错误：弹窗打开时贴在表单底下 */
  error: string
  form: TradeForm
  feeForm: TradeFeeForm
  tags: string[]
  /** 当前持仓：非建仓时「本轮费率」那一句说的是它的费率 */
  position: StockPositionDto | undefined
  /** 账本默认费率：恢复系统配置与「本轮费率」的兜底 */
  fee: StockFeeRates | null
  onChangeForm: (update: (current: TradeForm) => TradeForm) => void
  onChangeFeeForm: (update: (current: TradeFeeForm) => TradeFeeForm) => void
  /** 改代码：页面要先清掉「这个名字是自动带出来的」标记，再改表单 */
  onCodeChange: (value: string) => void
  onCancel: () => void
  onSubmit: () => void
  /** 正在改的那笔成交；null = 编辑弹窗关着 */
  editing: StockTradeDto | null
  editPrice: string
  editLots: string
  onChangeEditPrice: (value: string) => void
  onChangeEditLots: (value: string) => void
  onCancelEdit: () => void
  onSaveEdit: () => void
}

/**
 * 持仓页的成交录入：委托弹窗（表单 + 费用设置 + 费用实时明细）与「编辑成交」弹窗。
 *
 * 表单状态在页面手里 —— 这里只按 props 画，并把每次改动原样回传；
 * 费用明细是纯计算（`computeOrderFee`），不碰服务端。
 */
export function StockPositionsTrade({
  ledgerId,
  open,
  busy,
  error,
  form,
  feeForm,
  tags,
  position,
  fee,
  onChangeForm,
  onChangeFeeForm,
  onCodeChange,
  onCancel,
  onSubmit,
  editing,
  editPrice,
  editLots,
  onChangeEditPrice,
  onChangeEditLots,
  onCancelEdit,
  onSaveEdit,
}: StockPositionsTradeProps): JSX.Element {
  const tradeFillAmounts = form.fills
    .map((fill) => Math.round(Number(fill.price) * 100) * Math.round(Number(fill.lots) * 100))
    .filter((amount) => Number.isFinite(amount) && amount > 0)
  const tradeAmount = tradeFillAmounts.reduce((sum, amount) => sum + amount, 0)
  const tradeLots = form.fills.reduce(
    (sum, fill) => sum + (Number(fill.price) > 0 ? Number(fill.lots) || 0 : 0),
    0,
  )
  const tradeIsBuy = form.type === 'open' || form.type === 'add'
  const tradeFeeRates = feeRatesOf(feeForm)
  const tradeFeeSetting = {
    id: '',
    ledgerId,
    createdAt: 0,
    updatedAt: 0,
    ...tradeFeeRates,
  }
  const tradeFeeBreakdown = computeOrderFee(
    tradeFillAmounts,
    instrumentOf(form.code.trim()) ?? 'shenzhenStock',
    tradeFeeSetting,
    tradeIsBuy,
  )
  const tradeFeeUnknown = tradeFillAmounts.length === 0
  const tradeFeeTotal = tradeFeeUnknown ? 0 : tradeFeeBreakdown.total
  const tradeTotal = tradeIsBuy ? tradeAmount + tradeFeeTotal : tradeAmount - tradeFeeTotal

  const updateFill = (index: number, key: 'price' | 'lots', value: string): void => {
    onChangeForm((current) => ({
      ...current,
      fills: current.fills.map((fill, fillIndex) =>
        fillIndex === index ? { ...fill, [key]: value } : fill,
      ),
    }))
  }

  return (
    <>
      <Modal
        open={open}
        title={`委托${stockTradeTypeLabel(form.type)}`}
        width={640}
        centered
        destroyOnHidden
        footer={null}
        onCancel={onCancel}
      >
        <div className="stock-modal-form stock-trade-form">
          <div className="stock-modal-grid">
            <label>
              <span className="stock-label">股票名称</span>
              <Input
                data-testid="trade-name"
                value={form.name}
                disabled={form.type !== 'open'}
                onChange={(event) =>
                  onChangeForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              <span className="stock-label">股票代码</span>
              <Input
                data-testid="trade-code"
                value={form.code}
                disabled={form.type !== 'open'}
                onChange={(event) => onCodeChange(event.target.value)}
              />
            </label>
          </div>

          <section className="stock-trade-block">
            <div className="stock-trade-block__head">
              <span className="stock-trade-section__title">成交明细</span>
              <Button
                variant="text"
                size="sm"
                testId="trade-add-fill"
                onClick={() =>
                  onChangeForm((current) => ({
                    ...current,
                    fills: [...current.fills, { price: '', lots: '' }],
                  }))
                }
              >
                + 添加一笔成交
              </Button>
            </div>
            {form.fills.map((fill, index) => (
              <div className="stock-trade-fill" key={index}>
                <Input
                  data-testid={index === 0 ? 'trade-price' : `trade-price-${index + 1}`}
                  inputMode="decimal"
                  placeholder="成交价（元/股）"
                  value={fill.price}
                  onChange={(event) => updateFill(index, 'price', event.target.value)}
                />
                <Input
                  data-testid={index === 0 ? 'trade-lots' : `trade-lots-${index + 1}`}
                  inputMode="numeric"
                  placeholder={
                    form.type === 'close'
                      ? '手数'
                      : form.type === 'reduce'
                        ? '手数（可用）'
                        : '手数'
                  }
                  value={fill.lots}
                  disabled={form.type === 'close'}
                  onChange={(event) => updateFill(index, 'lots', event.target.value)}
                />
                {form.type === 'close' || form.fills.length === 1 ? (
                  <span className="stock-trade-fill__dash">—</span>
                ) : (
                  <Button
                    variant="text-danger"
                    size="sm"
                    testId={`trade-remove-fill-${index}`}
                    onClick={() =>
                      onChangeForm((current) => ({
                        ...current,
                        fills: current.fills.filter((_, fillIndex) => fillIndex !== index),
                      }))
                    }
                  >
                    −
                  </Button>
                )}
              </div>
            ))}
          </section>

          <section className="stock-trade-summary">
            <div>
              <span>合计</span>
              <span>
                {tradeFillAmounts.length} 笔 · {tradeLots} 手 · {stockMoney(tradeAmount)}
              </span>
            </div>
            <div>
              <span>预估费用</span>
              <span>{tradeFeeUnknown ? '—' : stockMoney(tradeFeeBreakdown.total)}</span>
            </div>
            <div className="stock-trade-summary__total">
              <span>{tradeIsBuy ? '预计支出' : '预计到手'}</span>
              <strong>{stockMoney(tradeTotal)}</strong>
            </div>
          </section>

          <div className="stock-modal-grid">
            <label>
              <span className="stock-label">委托时间</span>
              <DatePicker
                testId="trade-date"
                value={form.date}
                onChange={(value) => onChangeForm((current) => ({ ...current, date: value }))}
              />
            </label>
            <label>
              <span className="stock-label">交易标签</span>
              <Select
                data-testid="trade-tag"
                value={form.tag}
                onChange={(value) => onChangeForm((current) => ({ ...current, tag: value }))}
                options={tags.map((tag) => ({ value: tag, label: tag }))}
              />
            </label>
          </div>

          <section className="stock-trade-fees">
            <div className="stock-trade-block__head">
              <span className="stock-trade-section__title">本轮费用设置</span>
              {form.type === 'open' ? (
                <Button
                  variant="text"
                  size="sm"
                  testId="trade-fee-restore"
                  onClick={() => onChangeFeeForm(() => feeFormOf(fee))}
                >
                  恢复系统配置
                </Button>
              ) : null}
            </div>
            {form.type === 'open' ? (
              <div className="stock-modal-grid">
                <label>
                  <span className="stock-label">佣金费率（万分之）</span>
                  <Input
                    data-testid="trade-fee-commission"
                    inputMode="decimal"
                    value={feeForm.commission}
                    onChange={(event) =>
                      onChangeFeeForm((current) => ({
                        ...current,
                        commission: event.target.value,
                      }))
                    }
                  />
                </label>
                <label>
                  <span className="stock-label">最低佣金（元/委托）</span>
                  <Input
                    data-testid="trade-fee-min"
                    inputMode="decimal"
                    value={feeForm.min}
                    onChange={(event) =>
                      onChangeFeeForm((current) => ({ ...current, min: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span className="stock-label">印花税（%）</span>
                  <Input
                    data-testid="trade-fee-stamp"
                    inputMode="decimal"
                    value={feeForm.stamp}
                    onChange={(event) =>
                      onChangeFeeForm((current) => ({ ...current, stamp: event.target.value }))
                    }
                  />
                </label>
                <label>
                  <span className="stock-label">过户费（%）</span>
                  <Input
                    data-testid="trade-fee-transfer"
                    inputMode="decimal"
                    value={feeForm.transfer}
                    onChange={(event) =>
                      onChangeFeeForm((current) => ({ ...current, transfer: event.target.value }))
                    }
                  />
                </label>
              </div>
            ) : (
              <p className="stock-trade-fee-text">
                {position ? feeText(position, fee) : '本轮费率沿用账本默认'}
              </p>
            )}
          </section>

          {error ? (
            <p role="alert" className="stock-modal-error">
              {error}
            </p>
          ) : null}
          <div className="stock-modal-actions">
            <Button variant="secondary" testId="trade-cancel" onClick={onCancel}>
              取消
            </Button>
            <Button variant="primary" testId="trade-save" loading={busy} onClick={onSubmit}>
              {stockTradeTypeLabel(form.type)}
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={editing !== null}
        title="编辑成交"
        width={420}
        centered
        destroyOnHidden
        footer={null}
        onCancel={onCancelEdit}
      >
        <div className="stock-modal-form">
          <label>
            <span className="stock-label">价格（元）</span>
            <Input
              data-testid="stock-trade-price"
              value={editPrice}
              onChange={(event) => onChangeEditPrice(event.target.value)}
            />
          </label>
          <label>
            <span className="stock-label">手数</span>
            <Input
              data-testid="stock-trade-lots"
              value={editLots}
              onChange={(event) => onChangeEditLots(event.target.value)}
            />
          </label>
          <div className="stock-modal-actions">
            <Button variant="secondary" onClick={onCancelEdit}>
              取消
            </Button>
            <Button variant="primary" testId="stock-trade-save" onClick={onSaveEdit}>
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
