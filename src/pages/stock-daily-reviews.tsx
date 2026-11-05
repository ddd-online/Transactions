import { useState, type JSX, type ReactNode } from 'react'

import { Modal } from 'antd'

import type { StockDayReviewDto } from '../../shared/types/stock-position'
import { Button } from '../components/button'

export interface StockDailyReviewsProps {
  /** 一天一条，最新在上（调用方给的那份顺序就是显示顺序） */
  days: StockDayReviewDto[]
  /** testid 前缀：列表、单条、弹窗正文依次是 `-`、`-item`、`-full` */
  testId: string
  /** 一条都没有时显示的那句话 —— 持仓能写、记录只能看，两页说的不是同一句 */
  empty: ReactNode
  /**
   * 给了就能改：读全文的弹窗底下多一颗「编辑」，按那一天交回调用方。
   *
   * 只有持仓给这个回调 —— 记录里那一轮是已经收尾的，服务层也拒绝再改，
   * 摆一颗按下去只会报错的按钮不如不摆。
   */
  onEdit?: (day: StockDayReviewDto) => void
}

/**
 * 每日复盘：一天一条、最新在上，一行放不下就省略；点整行打开弹窗读全文。
 * 持仓详情里那颗「编辑」把同一天交回调用方的编辑器（记录里不给 —— 收尾的轮次改不了）。
 *
 * 持仓详情与记录里的某一轮共用这一份 —— 两处看的是同一批复盘，
 * 一处能点开、一处只能顺着读，会让人以为记录里丢了内容。
 */
export function StockDailyReviews({
  days,
  testId,
  empty,
  onEdit,
}: StockDailyReviewsProps): JSX.Element {
  // 正在读全文的那一天（null = 没开弹窗）
  const [reading, setReading] = useState<StockDayReviewDto | null>(null)
  return (
    <>
      {days.length > 0 ? (
        <ul className="stock-review-days" data-testid={testId}>
          {days.map((day) => (
            <li key={day.date}>
              <button
                type="button"
                className="stock-review-day"
                data-testid={`${testId}-item`}
                aria-label={`查看 ${day.date} 的每日复盘`}
                onClick={() => setReading(day)}
              >
                <span className="stock-review-day__date">{day.date}</span>
                <span className="stock-review-day__text">{day.review}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        empty
      )}
      <Modal
        open={reading !== null}
        title={reading ? `每日复盘 · ${reading.date}` : '每日复盘'}
        width={560}
        centered
        footer={null}
        onCancel={() => setReading(null)}
      >
        <div className="stock-review-read" data-testid={`${testId}-full`}>
          {reading?.review}
        </div>
        {onEdit && reading ? (
          <div className="stock-modal-actions">
            <Button
              variant="secondary"
              testId={`${testId}-close`}
              onClick={() => setReading(null)}
            >
              关闭
            </Button>
            <Button
              variant="primary"
              testId={`${testId}-edit`}
              onClick={() => {
                onEdit(reading)
                setReading(null)
              }}
            >
              编辑
            </Button>
          </div>
        ) : null}
      </Modal>
    </>
  )
}
