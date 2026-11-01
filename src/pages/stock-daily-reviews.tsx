import { useState, type JSX, type ReactNode } from 'react'

import { Modal } from 'antd'

import type { StockDayReviewDto } from '../../shared/types/stock-position'

export interface StockDailyReviewsProps {
  /** 一天一条，最新在上（调用方给的那份顺序就是显示顺序） */
  days: StockDayReviewDto[]
  /** testid 前缀：列表、单条、弹窗正文依次是 `-`、`-item`、`-full` */
  testId: string
  /** 一条都没有时显示的那句话 —— 持仓能写、记录只能看，两页说的不是同一句 */
  empty: ReactNode
}

/**
 * 每日复盘：一天一条、最新在上，一行放不下就省略；点整行打开弹窗读全文。
 *
 * 持仓详情与记录里的某一轮共用这一份 —— 两处看的是同一批复盘，
 * 一处能点开、一处只能顺着读，会让人以为记录里丢了内容。
 */
export function StockDailyReviews({ days, testId, empty }: StockDailyReviewsProps): JSX.Element {
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
      </Modal>
    </>
  )
}
