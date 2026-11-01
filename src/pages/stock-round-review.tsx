import { useCallback, useEffect, useState, type JSX } from 'react'

import { Input, Modal } from 'antd'

import { Button } from '../components/button'

export interface StockRoundReviewProps {
  /** testid 前缀：行 / 编辑 / 正文 / 保存 / 取消 / 全文 */
  testId: string
  /** 已保存的这一轮复盘（空串 = 还没写） */
  review: string
  /** 第一次写时的起头模板（买入理由 / 卖出理由 …） */
  template: string
  /** 一条都没写时，那一行显示的话 */
  emptyText: string
  /** 编辑弹窗是否打开 —— 由标题行那颗「编辑」按钮控制 */
  editing: boolean
  onEditingChange: (editing: boolean) => void
  onSave: (review: string) => Promise<void>
}

/**
 * 本轮复盘：一行只读（放不下就省略），点开弹窗看全文；改名走弹窗里的编辑器。
 *
 * 以前就地在段落里铺开——一段长复盘能把下面的每日复盘与成交记录顶走，
 * 而且和每日复盘的读法是两套。持仓详情与记录里的那一轮共用这一份。
 */
export function StockRoundReview({
  testId,
  review,
  template,
  emptyText,
  editing,
  onEditingChange,
  onSave,
}: StockRoundReviewProps): JSX.Element {
  const [draft, setDraft] = useState('')
  const [reading, setReading] = useState(false)
  const filled = review.trim().length > 0

  // 打开编辑器：已写过的原文打头；空复盘第一次用本轮模板；动过的草稿不被覆盖
  useEffect(() => {
    if (!editing) return
    setDraft((current) => (current.trim() ? current : filled ? review : template))
  }, [editing, filled, review, template])

  const save = useCallback((): void => {
    void (async () => {
      await onSave(draft)
      onEditingChange(false)
    })()
  }, [draft, onEditingChange, onSave])

  return (
    <>
      <div className="stock-review-line">
        <button
          type="button"
          className="stock-review-day"
          data-testid={`${testId}-preview`}
          aria-label={filled ? '查看本轮复盘全文' : '写本轮复盘'}
          onClick={() => (filled ? setReading(true) : onEditingChange(true))}
        >
          <span className={`stock-review-day__text${filled ? '' : ' stock-muted'}`}>
            {filled ? review : emptyText}
          </span>
        </button>
      </div>

      <Modal
        open={reading}
        title="本轮复盘"
        width={560}
        centered
        footer={null}
        onCancel={() => setReading(false)}
      >
        <div className="stock-review-read" data-testid={`${testId}-review-full`}>
          {review}
        </div>
      </Modal>

      <Modal
        open={editing}
        title="本轮复盘"
        width={560}
        centered
        footer={null}
        onCancel={() => onEditingChange(false)}
      >
        <div className="stock-modal-form">
          <label>
            <span className="stock-label">复盘</span>
            <Input.TextArea
              data-testid={`${testId}-review`}
              rows={6}
              placeholder="买入理由 / 卖出理由 / 买点审视 / 卖点审视 / 交易心得"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          </label>
          <div className="stock-modal-actions">
            <Button
              variant="secondary"
              testId={`${testId}-cancel`}
              onClick={() => onEditingChange(false)}
            >
              取消
            </Button>
            <Button variant="primary" testId={`${testId}-save`} onClick={save}>
              保存复盘
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
