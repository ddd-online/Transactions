import type { JSX } from 'react'

import { Input, Modal } from 'antd'

import { Button } from '../components/button'

/** 弹窗里的费率草稿：佣金（万分之）/ 最低佣金（元）/ 印花税与过户费（百分数）。 */
export interface StockFeeForm {
  commission: string
  minCommission: string
  stamp: string
  transfer: string
}

export interface StockSettingsFeesProps {
  open: boolean
  form: StockFeeForm
  busy: boolean
  onOpen: () => void
  onChange: (update: (current: StockFeeForm) => StockFeeForm) => void
  onSave: () => void
  onClose: () => void
}

/** 交易费用设置：一行摘要 + 四个费率输入的弹窗；落库与提示仍在页面。 */
export function StockSettingsFees({
  open,
  form,
  busy,
  onOpen,
  onChange,
  onSave,
  onClose,
}: StockSettingsFeesProps): JSX.Element {
  return (
    <>
      <section className="stock-setting-row">
        <div className="stock-setting-row__info">
          <h2>交易费用设置</h2>
          <p>
            佣金 万{Number(form.commission || 0).toLocaleString('zh-CN', { maximumFractionDigits: 4 })} ·
            最低 ¥{form.minCommission || '0.00'} · 印花税 {form.stamp || '0'}% ·
            过户费 {form.transfer || '0'}%。建仓时按这里的默认值预填。
          </p>
        </div>
        <div className="stock-setting-row__actions">
          <Button variant="secondary" testId="fee-open" onClick={onOpen}>
            修改
          </Button>
        </div>
      </section>

      <Modal
        open={open}
        title="交易费用设置"
        width={640}
        centered
        footer={null}
        onCancel={onClose}
      >
        <div className="stock-modal-form">
          <div className="stock-fee-grid">
            <label>
              <span>佣金费率</span>
              <Input
                data-testid="fee-commission"
                value={form.commission}
                onChange={(event) =>
                  onChange((current) => ({ ...current, commission: event.target.value }))
                }
                suffix="万分之"
              />
            </label>
            <label>
              <span>最低佣金</span>
              <Input
                data-testid="fee-min"
                value={form.minCommission}
                onChange={(event) =>
                  onChange((current) => ({ ...current, minCommission: event.target.value }))
                }
                suffix="元/委托"
              />
            </label>
            <label>
              <span>印花税</span>
              <Input
                data-testid="fee-stamp"
                value={form.stamp}
                onChange={(event) =>
                  onChange((current) => ({ ...current, stamp: event.target.value }))
                }
                suffix="%"
              />
            </label>
            <label>
              <span>过户费</span>
              <Input
                data-testid="fee-transfer"
                value={form.transfer}
                onChange={(event) =>
                  onChange((current) => ({ ...current, transfer: event.target.value }))
                }
                suffix="%"
              />
            </label>
          </div>
          <p className="stock-fee-note">
            这些是默认值：建仓时按它预填（可在建仓弹窗里改），建仓那一刻起本轮的费率就固定了 ——
            改这里不影响进行中的轮次，只对之后新建仓的轮次生效。
          </p>
          <div className="stock-modal-actions">
            <Button variant="secondary" onClick={onClose}>
              取消
            </Button>
            <Button variant="primary" testId="fee-save" loading={busy} onClick={onSave}>
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
