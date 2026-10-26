import { useCallback, useEffect, useState, type HTMLAttributes, type JSX } from 'react'

import { Popconfirm, Table } from 'antd'

import type { StockLessonDto } from '../../shared/types/stock-lesson'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { ScrollArea } from '../components/scroll-area'
import { notify } from '../components/toast'
import { stockErrorMessage } from './stock-format'

export interface StockLessonsPanelProps {
  ledgerId: string
  refreshToken: number
  onEdit: (lesson: StockLessonDto) => void
  onJump: (target: { code: string; roundId: string }) => void
}

function SourceLine({ lesson }: { lesson: StockLessonDto }): JSX.Element {
  if (!lesson.roundId) {
    return <span className="stock-muted">未关联交易轮次</span>
  }
  return (
    <>
      <span className="stock-lesson__stock">
        {lesson.stockName || lesson.stockCode}
      </span>
      {lesson.stockName && lesson.stockName !== lesson.stockCode ? (
        <span className="stock-lesson__code">{lesson.stockCode}</span>
      ) : null}
      <span>第 {lesson.roundNo} 轮</span>
      {lesson.sourceAvailable ? null : (
        <span className="stock-lesson__missing">来源轮次已删除</span>
      )}
    </>
  )
}

/** 股票心得列表：一句心得一行，关联交易独立成列。 */
export function StockLessonsPanel({
  ledgerId,
  refreshToken,
  onEdit,
  onJump,
}: StockLessonsPanelProps): JSX.Element {
  const [lessons, setLessons] = useState<StockLessonDto[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setLessons([])
      setLoaded(true)
      return
    }
    try {
      const rows = await window.api.invoke('stock_lesson_list', { ledger_id: ledgerId })
      setLessons(rows)
      setError('')
    } catch (loadError) {
      setError(stockErrorMessage(loadError))
    } finally {
      setLoaded(true)
    }
  }, [ledgerId])

  useEffect(() => {
    void load()
  }, [load, refreshToken])

  const remove = async (lesson: StockLessonDto): Promise<void> => {
    try {
      await window.api.invoke('stock_lesson_delete', {
        ledger_id: ledgerId,
        id: lesson.id,
      })
      notify('心得已删除')
      await load()
    } catch (deleteError) {
      setError(stockErrorMessage(deleteError))
    }
  }

  return (
    <div className="stock-lessons-view">
      {error ? (
        <p className="m0-error stock-inline-error" data-testid="stock-lesson-page-error">
          {error}
        </p>
      ) : null}

      {!loaded ? (
        <div className="stock-table-skeleton stock-lessons-skeleton" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      ) : lessons.length === 0 ? (
        <EmptyState
          testId="stock-lesson-empty"
          title={ledgerId ? '还没有心得' : '请先创建/选择账本'}
          description={
            ledgerId
              ? '从记录里找一轮交易，把当时做对或做错的一句话记下来。'
              : undefined
          }
        />
      ) : (
        <ScrollArea className="stock-lessons-scroll">
          <Table
            className="tr-table stock-lessons-table"
            rowKey="id"
            pagination={false}
            size="middle"
            tableLayout="fixed"
            dataSource={lessons}
            onRow={() => ({ 'data-testid': 'stock-lesson-row' }) as HTMLAttributes<HTMLElement>}
            columns={[
              {
                title: '心得',
                dataIndex: 'text',
                render: (_value: string, lesson: StockLessonDto) => (
                  <p className="stock-lesson__text" title={lesson.text}>
                    {lesson.text}
                  </p>
                ),
              },
              {
                title: '关联交易',
                key: 'source',
                width: 260,
                render: (_value: unknown, lesson: StockLessonDto) => (
                  <div className="stock-lesson__source">
                    <span className="stock-lesson__source-label">关联交易</span>
                    <SourceLine lesson={lesson} />
                  </div>
                ),
              },
              {
                title: '操作',
                key: 'actions',
                align: 'center',
                width: 112,
                render: (_value: unknown, lesson: StockLessonDto) => {
                  const canJump = Boolean(lesson.roundId && lesson.sourceAvailable)
                  const jumpTitle = !lesson.roundId
                    ? '未关联交易轮次'
                    : lesson.sourceAvailable
                      ? '查看来源轮次'
                      : '来源轮次已删除'
                  return (
                    <div className="stock-lesson__actions">
                      <button
                        type="button"
                        className="tr-icon-btn stock-lesson__action"
                        data-testid="stock-lesson-edit"
                        aria-label={`编辑心得：${lesson.text}`}
                        title="编辑"
                        onClick={() => onEdit(lesson)}
                      >
                        <Icon name="Edit" size={16} />
                      </button>
                      <button
                        type="button"
                        className="tr-icon-btn stock-lesson__action"
                        data-testid="stock-lesson-jump"
                        aria-label={`查看来源轮次：${lesson.text}`}
                        title={jumpTitle}
                        disabled={!canJump}
                        onClick={() => {
                          if (!lesson.roundId) return
                          onJump({ code: lesson.stockCode, roundId: lesson.roundId })
                        }}
                      >
                        <Icon name="Eye" size={16} />
                      </button>
                      <Popconfirm
                        title="删除这条心得？"
                        description="关联的交易轮次不会被删除。"
                        placement="bottomRight"
                        okText="删除"
                        cancelText="取消"
                        okType="danger"
                        onConfirm={() => void remove(lesson)}
                      >
                        <button
                          type="button"
                          className="tr-icon-btn is-danger-static stock-lesson__action"
                          data-testid="stock-lesson-delete"
                          aria-label={`删除心得：${lesson.text}`}
                          title="删除"
                        >
                          <Icon name="Trash" size={16} />
                        </button>
                      </Popconfirm>
                    </div>
                  )
                },
              },
            ]}
          />
        </ScrollArea>
      )}
    </div>
  )
}
