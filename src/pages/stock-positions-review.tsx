import type { JSX } from 'react'

import { Input, Modal } from 'antd'

import type { StockDayReviewDto, StockPositionDto } from '../../shared/types/stock-position'
import { Button } from '../components/button'
import { DatePicker } from '../components/date-picker'
import { StockDailyReviews } from './stock-daily-reviews'
import { StockRoundReview } from './stock-round-review'

export interface StockPositionsReviewProps {
  position: StockPositionDto
  /** 本轮复盘第一次写的起头模板（来自账本设置） */
  roundTemplate: string
  roundEditing: boolean
  onRoundEditingChange: (editing: boolean) => void
  onSaveRound: (review: string) => Promise<void>
  /** 每日复盘编辑器是否打开 */
  reviewOpen: boolean
  /** 非空 = 正在改那一天；null = 打开的是「写今日」 */
  editingDay: StockDayReviewDto | null
  dailyDate: string
  dailyText: string
  onDailyDateChange: (date: string) => void
  onDailyTextChange: (text: string) => void
  /** 写今日（空态那一行与标题行的按钮都走它） */
  onOpenDaily: () => void
  /** 点开已经写过的那一天：编辑器钉在那一天 */
  onEditDay: (day: StockDayReviewDto) => void
  onCloseDaily: () => void
  onSaveDaily: () => void
}

/**
 * 持仓详情里的复盘入口：每日复盘（列表 + 写今日）与本轮复盘（只读一行 + 编辑器）。
 *
 * 读写状态都由页面持有，这里只把入口、列表和弹窗摆好；
 * 列表与只读行分别复用 `StockDailyReviews` / `StockRoundReview`（记录页看的是同一批）。
 */
export function StockPositionsReview({
  position,
  roundTemplate,
  roundEditing,
  onRoundEditingChange,
  onSaveRound,
  reviewOpen,
  editingDay,
  dailyDate,
  dailyText,
  onDailyDateChange,
  onDailyTextChange,
  onOpenDaily,
  onEditDay,
  onCloseDaily,
  onSaveDaily,
}: StockPositionsReviewProps): JSX.Element {
  return (
    <>
      <section className="stock-detail__section">
        <span className="stock-section-title">每日复盘</span>
        <Button
          variant="secondary"
          size="sm"
          testId="position-review-open"
          onClick={onOpenDaily}
        >
          写今日
        </Button>
      </section>
      <StockDailyReviews
        days={position.dayReviews}
        testId="position-daily-review"
        onEdit={onEditDay}
        empty={
          // 空态也是一行、也能点：点它就是「写今日」，和上面有内容的行同一种反馈
          <div className="stock-review-line">
            <button
              type="button"
              className="stock-review-day"
              data-testid="position-daily-review"
              aria-label="写今日的每日复盘"
              onClick={onOpenDaily}
            >
              <span className="stock-review-day__text stock-muted">
                还没有写每日复盘，点「写今日」记下今天的盘面和判断。
              </span>
            </button>
          </div>
        }
      />

      <section className="stock-detail__section">
        <span className="stock-section-title">本轮复盘</span>
        <Button
          variant="secondary"
          size="sm"
          testId="position-round-edit"
          onClick={() => onRoundEditingChange(true)}
        >
          编辑
        </Button>
      </section>
      <StockRoundReview
        key={position.stockCode}
        testId="position-round"
        review={position.review}
        template={roundTemplate}
        emptyText="还没有写本轮复盘，点「编辑」记录买入与卖出的理由。"
        editing={roundEditing}
        onEditingChange={onRoundEditingChange}
        onSave={onSaveRound}
      />

      <Modal
        open={reviewOpen}
        title={editingDay ? `每日复盘 · ${editingDay.date}` : '每日复盘'}
        width={560}
        centered
        destroyOnHidden
        footer={null}
        onCancel={onCloseDaily}
      >
        <div className="stock-modal-form">
          {editingDay ? (
            // 改的是某一天：日期不是字段，是这一行的身份 —— 不摆一个灰掉、看起来像坏了的选择器
            <div>
              <span className="stock-label">日期</span>
              <span className="stock-review-date" data-testid="position-review-date-value">
                {editingDay.date}
              </span>
            </div>
          ) : (
            <label>
              <span className="stock-label">日期</span>
              <DatePicker
                testId="position-review-date"
                value={dailyDate}
                onChange={onDailyDateChange}
              />
            </label>
          )}
          <label>
            <span className="stock-label">复盘</span>
            <Input.TextArea
              data-testid="position-review-text"
              aria-label={editingDay ? `${editingDay.date} 的每日复盘` : '今日的每日复盘'}
              rows={6}
              placeholder="记录今天的盘面与判断"
              value={dailyText}
              onChange={(event) => onDailyTextChange(event.target.value)}
            />
          </label>
          <div className="stock-modal-actions">
            <Button variant="secondary" testId="position-review-cancel" onClick={onCloseDaily}>
              取消
            </Button>
            <Button variant="primary" testId="position-review-save" onClick={onSaveDaily}>
              保存
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
}
