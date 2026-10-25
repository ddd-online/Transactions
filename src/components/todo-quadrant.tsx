import { useLayoutEffect, useMemo, useRef, useState, type JSX, type KeyboardEvent } from 'react'

import { Modal } from 'antd'

import { todoLevelLabel } from '../../shared/domain/consts'
import {
  POINT_RADIUS,
  QUADRANTS,
  Quadrant,
  type QuadrantItem,
  axisOf,
  pointOf,
  quadrantOf,
  rows as quadrantRows,
} from '../../shared/domain/quadrant'
import type { TodoCardDto } from '../../shared/types/todo'
import { Button } from './button'

interface Entry extends QuadrantItem {
  id: string
  cardTitle: string
  title: string
  startDate: string
  dueDate: string
}

const QUADRANT_LABEL: Record<Quadrant, string> = {
  [Quadrant.Now]: '马上做',
  [Quadrant.Plan]: '计划做',
  [Quadrant.Less]: '减少做',
  [Quadrant.Delegate]: '授权做',
}

const QUADRANT_MEANING: Record<Quadrant, string> = {
  [Quadrant.Now]: '重要且紧急',
  [Quadrant.Plan]: '重要但不紧急',
  [Quadrant.Less]: '不重要且不紧急',
  [Quadrant.Delegate]: '紧急但不重要',
}

function itemDates(startDate: string, dueDate: string): string {
  if (!startDate && !dueDate) return ''
  if (startDate && !dueDate) return `${startDate} 起`
  if (!startDate && dueDate) return `${dueDate} 截止`
  return `${startDate} → ${dueDate}`
}

/**
 * 四象限图：进行中的事项按（紧急度, 重要度）落点。
 *
 * 落点、抖动、排序都在 `shared/domain/quadrant`（有单测盯着「最外档位不会被裁掉」）；
 * 这里只负责量画布、画象限与点、点象限名打开清单。颜色沿用单一强调色：四格用同一支
 * Clarity Blue / Ink 的明度分档，象限名是低浓度水印，点才是图上的数据。
 */
export function TodoQuadrant({ cards }: { cards: TodoCardDto[] }): JSX.Element {
  const canvasRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 720, height: 460 })
  const [open, setOpen] = useState<Quadrant | null>(null)

  const entries = useMemo<Entry[]>(
    () =>
      cards.flatMap((card) =>
        card.items.map((item) => ({
          id: item.id,
          cardTitle: card.title,
          title: item.title,
          startDate: item.startDate,
          dueDate: item.dueDate,
          urgency: item.urgency,
          importance: item.importance,
        })),
      ),
    [cards],
  )

  useLayoutEffect(() => {
    const node = canvasRef.current
    if (!node) return
    const measure = (): void => {
      const rect = node.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        setSize({ width: Math.round(rect.width), height: Math.round(rect.height) })
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const { width: w, height: h } = size
  const [axisX, axisY] = axisOf(w, h)
  // 水印字号按象限宽度的三成算（四个名字都是三个字），夹在 22–72 之间。
  const namePx = Math.min(72, Math.max(22, (axisX * 0.3) / 3))
  // 中文字形的墨高约 0.96em：让整块墨落在象限中心，基线压在中心下方 0.36em。
  const nameDy = namePx * 0.36
  const namePosition: Record<Quadrant, readonly [number, number]> = {
    [Quadrant.Plan]: [axisX / 2, axisY / 2],
    [Quadrant.Now]: [axisX + (w - axisX) / 2, axisY / 2],
    [Quadrant.Less]: [axisX / 2, axisY + (h - axisY) / 2],
    [Quadrant.Delegate]: [axisX + (w - axisX) / 2, axisY + (h - axisY) / 2],
  }
  const counts = QUADRANTS.map((quadrant) => entries.filter((entry) => quadrantOf(entry) === quadrant).length)
  const openRows = open ? quadrantRows(entries, open) : []

  const openFromKey = (event: KeyboardEvent<SVGTextElement>, quadrant: Quadrant): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setOpen(quadrant)
    }
  }

  return (
    <div className="todo-quadrant" data-testid="todo-quadrant">
      <div className="todo-quadrant__canvas" ref={canvasRef}>
        <svg
          className="todo-quadrant__svg"
          viewBox={`0 0 ${w} ${h}`}
          role="group"
          aria-label="进行中事项的四象限分布"
        >
          <rect
            className="todo-quadrant__ground todo-quadrant__ground--now"
            x={axisX}
            y={0}
            width={w - axisX}
            height={axisY}
          />
          <rect
            className="todo-quadrant__ground todo-quadrant__ground--plan"
            x={0}
            y={0}
            width={axisX}
            height={axisY}
          />
          <rect
            className="todo-quadrant__ground todo-quadrant__ground--less"
            x={0}
            y={axisY}
            width={axisX}
            height={h - axisY}
          />
          <rect
            className="todo-quadrant__ground todo-quadrant__ground--delegate"
            x={axisX}
            y={axisY}
            width={w - axisX}
            height={h - axisY}
          />

          <line className="todo-quadrant__axis" x1={axisX} y1={0} x2={axisX} y2={h} />
          <line className="todo-quadrant__axis" x1={0} y1={axisY} x2={w} y2={axisY} />

          {QUADRANTS.map((quadrant, index) => {
            const [x, y] = namePosition[quadrant]
            const count = counts[index]
            return (
              <text
                key={quadrant}
                className={`todo-quadrant__name${
                  quadrant === Quadrant.Now ? ' todo-quadrant__name--now' : ''
                }`}
                x={x}
                y={y + nameDy}
                fontSize={namePx}
                textAnchor="middle"
                role="button"
                tabIndex={0}
                aria-label={`${QUADRANT_LABEL[quadrant]} · ${count} 项进行中`}
                onClick={() => setOpen(quadrant)}
                onKeyDown={(event) => openFromKey(event, quadrant)}
              >
                <title>
                  {`${QUADRANT_LABEL[quadrant]} · ${QUADRANT_MEANING[quadrant]}（${count} 项进行中，点击查看列表）`}
                </title>
                {QUADRANT_LABEL[quadrant]}
              </text>
            )
          })}

          <text className="todo-quadrant__axis-label" x={w - 8} y={axisY - 10} textAnchor="end">
            紧急
          </text>
          <text className="todo-quadrant__axis-label" x={8} y={axisY - 10}>
            不紧急
          </text>
          <text className="todo-quadrant__axis-label" x={axisX + 10} y={21}>
            重要
          </text>
          <text className="todo-quadrant__axis-label" x={axisX + 10} y={h - 10}>
            不重要
          </text>

          {entries.map((entry) => {
            const [cx, cy] = pointOf(entry.urgency, entry.importance, entry.id, w, h)
            return (
              <circle
                key={entry.id}
                className="todo-quadrant__point"
                cx={cx}
                cy={cy}
                r={POINT_RADIUS}
              >
                <title>
                  {`${entry.title}\n${entry.cardTitle} · 紧急 ${todoLevelLabel(entry.urgency)} · 重要 ${todoLevelLabel(entry.importance)}`}
                </title>
              </circle>
            )
          })}
        </svg>
      </div>

      <Modal
        open={open !== null}
        title={open ? `${QUADRANT_LABEL[open]} · ${QUADRANT_MEANING[open]}` : ''}
        width={520}
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => setOpen(null)}
      >
        {open ? (
          <div className="todo-quadrant-modal">
            {openRows.length === 0 ? (
              <p className="todo-progress__empty">这个象限里还没有进行中的事项。</p>
            ) : (
              <ul className="todo-quadrant-modal__list">
                {openRows.map((entry) => {
                  const dates = itemDates(entry.startDate, entry.dueDate)
                  return (
                    <li
                      key={entry.id}
                      className="todo-quadrant-modal__row"
                      data-testid="todo-quadrant-row"
                    >
                      <span className="todo-quadrant-modal__title">{entry.title}</span>
                      <div className="todo-quadrant-modal__meta">
                        <span className="todo-quadrant-modal__card">{entry.cardTitle}</span>
                        <span className="todo-item__levels">
                          <span className="todo-level" title="紧急度">
                            紧急 {todoLevelLabel(entry.urgency)}
                          </span>
                          <span className="todo-level" title="重要度">
                            重要 {todoLevelLabel(entry.importance)}
                          </span>
                        </span>
                        {dates ? (
                          <span className="todo-quadrant-modal__dates">{dates}</span>
                        ) : null}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
            <div className="todo-modal__actions">
              <Button variant="secondary" onClick={() => setOpen(null)}>
                关闭
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  )
}
