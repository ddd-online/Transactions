import { describe, expect, it } from 'vitest'

import { TODO_LEVELS } from '../../shared/domain/consts'
import {
  JITTER_MAX,
  LEVEL_SPAN,
  PLOT_INSET,
  POINT_RADIUS,
  QUADRANTS,
  Quadrant,
  axisOf,
  jitterOf,
  pointOf,
  quadrantFromLevels,
  rows,
  type QuadrantItem,
} from '../../shared/domain/quadrant'

interface Item extends QuadrantItem {
  id: string
}

function item(id: string, urgency: number, importance: number): Item {
  return { id, urgency, importance }
}

/** 一批 id（事项的 id 是 uuid，哈希出来的抖动落在整个区间里）。 */
function ids(): string[] {
  return Array.from({ length: 24 }, (_, index) => `item-${index}`)
}

describe('quadrant', () => {
  // 六档两两组合都要落到对的那一格（没有任何一档落在"轴上"）。
  it('every level pair lands in exactly one quadrant', () => {
    const levels = [-5, -3, -1, 1, 3, 5]
    for (const urgency of levels) {
      for (const importance of levels) {
        const expected =
          importance > 0
            ? urgency > 0
              ? Quadrant.Now
              : Quadrant.Plan
            : urgency > 0
              ? Quadrant.Delegate
              : Quadrant.Less
        expect(
          quadrantFromLevels(urgency, importance),
          `紧急 ${urgency} / 重要 ${importance}`,
        ).toBe(expected)
      }
    }
    // 四格都被覆盖到，且 QUADRANTS 不重复
    expect(new Set(QUADRANTS).size).toBe(4)
  })

  it('rows filter by quadrant and sort by urgency then importance', () => {
    const items = [
      item('a', 1, 1),
      item('b', 5, 1),
      item('c', 5, 5),
      item('d', 1, 3),
      item('e', -5, 5), // Plan
      item('f', -1, -1), // Less
    ]
    expect(
      rows(items, Quadrant.Now).map((row) => row.id),
      '紧急降序 → 重要降序（d 的重要度 3 高于 a 的 1）',
    ).toEqual(['c', 'b', 'd', 'a'])
    expect(rows(items, Quadrant.Plan).map((row) => row.id)).toEqual(['e'])
    expect(rows(items, Quadrant.Delegate)).toEqual([])
  })

  // 同档位保持传入顺序（稳定排序）—— 弹窗每次打开都是同一个样。
  it('equal levels keep their input order', () => {
    const items = [item('x', 3, 3), item('y', 3, 3), item('z', 3, 3)]
    expect(rows(items, Quadrant.Now).map((row) => row.id)).toEqual(['x', 'y', 'z'])
  })

  it('jitter is stable bounded and spreads ids', () => {
    const [dx, dy] = jitterOf('todo-1')
    expect(jitterOf('todo-1'), '同一个 id 永远同一处').toEqual([dx, dy])
    expect(dx, `抖动必须落在 ±${JITTER_MAX} 之内（留白是按这个上限算的）`).toBeGreaterThanOrEqual(
      -JITTER_MAX,
    )
    expect(dx).toBeLessThanOrEqual(JITTER_MAX)
    expect(dy).toBeGreaterThanOrEqual(-JITTER_MAX)
    expect(dy).toBeLessThanOrEqual(JITTER_MAX)
    // 一小批真实规模的 id：不能全挤在同一点（否则点会叠成一坨）
    const unique = new Set(ids().map((id) => jitterOf(id).join(',')))
    expect(unique.size, '24 个 id 至少该散开一半').toBeGreaterThan(12)
  })

  // 额外护栏：偏移与旧实现（Rust `DefaultHasher`）逐位一致，点位不会跨版本漂移。
  it('jitter matches Rust DefaultHasher', () => {
    expect(jitterOf('todo-1')).toEqual([-7, -6])
    expect(jitterOf('item-0')).toEqual([-3, -10])
    expect(jitterOf('😀')).toEqual([8, 6])
  })

  // 档位表与坐标轴的跨度必须一致：TODO_LEVELS 加了更外的档（比如 7）而这里没跟上，
  // 那颗点就会跑到画布外 —— 这条比"点越界"那条更早红，指得出原因。
  it('level span matches the level table', () => {
    const widest = Math.max(...TODO_LEVELS.map((level) => Math.abs(level)))
    expect(widest * 2, `档位表 ${TODO_LEVELS.join(',')} 与 LEVEL_SPAN 对不上`).toBe(LEVEL_SPAN)
  })

  // **用户报的那个缺陷的护栏**：任何档位、任何 id，点连半径与白色描边都完整落在画布内。
  it('points never leave the canvas', () => {
    const reach = POINT_RADIUS + 1
    // 界面上可能出现的画布尺寸：宽是整个版心（几百到两千多），高最小 220（CSS 的 min-height）
    for (const [w, h] of [
      [1306, 923],
      [640, 220],
      [2400, 1400],
    ] as const) {
      for (const urgency of TODO_LEVELS) {
        for (const importance of TODO_LEVELS) {
          for (const id of ids()) {
            const [x, y] = pointOf(urgency, importance, id, w, h)
            expect(
              x - reach,
              `紧急 ${urgency} / 重要 ${importance} / id ${id} 的点横向越界：x=${x.toFixed(1)}（画布宽 ${w}）`,
            ).toBeGreaterThanOrEqual(0)
            expect(
              x + reach,
              `紧急 ${urgency} / 重要 ${importance} / id ${id} 的点横向越界：x=${x.toFixed(1)}（画布宽 ${w}）`,
            ).toBeLessThanOrEqual(w)
            expect(
              y - reach,
              `紧急 ${urgency} / 重要 ${importance} / id ${id} 的点纵向越界：y=${y.toFixed(1)}（画布高 ${h}）`,
            ).toBeGreaterThanOrEqual(0)
            expect(
              y + reach,
              `紧急 ${urgency} / 重要 ${importance} / id ${id} 的点纵向越界：y=${y.toFixed(1)}（画布高 ${h}）`,
            ).toBeLessThanOrEqual(h)
          }
        }
      }
    }
  })

  // 点落在十字轴的哪一侧必须与档位的正负一致：否则"图上看到的"与象限名的计数
  // （quadrantFromLevels 拿正负判）会自相矛盾。
  it('a point is on the same side of the axis as its level', () => {
    const [w, h] = [1306, 923]
    const [axisX, axisY] = axisOf(w, h)
    for (const urgency of TODO_LEVELS) {
      for (const importance of TODO_LEVELS) {
        for (const id of ids()) {
          const [x, y] = pointOf(urgency, importance, id, w, h)
          expect(x > axisX, `紧急 ${urgency} 落在轴的错误一侧`).toBe(urgency > 0)
          expect(y < axisY, `重要 ${importance} 落在轴的错误一侧`).toBe(importance > 0)
        }
      }
    }
  })

  // 留白只吃"画布边线 ↔ 最外档位"这一段：0 档仍然压在画布中心（十字轴上），
  // 最外档位离边线正好一个留白（把抖动减掉就是"理想落点"）；纵轴向上为正。
  it('the inset only shifts the outermost level', () => {
    const [w, h] = [1306, 923]
    expect(axisOf(w, h), '十字轴恒在画布中心').toEqual([w / 2, h / 2])
    const [dx, dy] = jitterOf('level-probe')
    for (const [level, expectedX] of [
      [-5, PLOT_INSET],
      [0, w / 2],
      [5, w - PLOT_INSET],
    ] as const) {
      const [x] = pointOf(level, -1, 'level-probe', w, h)
      expect(
        Math.abs(x - dx - expectedX),
        `${level} 档的理想横坐标 ${x - dx} ≠ ${expectedX}`,
      ).toBeLessThan(1e-9)
    }
    for (const [level, expectedY] of [
      [-5, h - PLOT_INSET],
      [0, h / 2],
      [5, PLOT_INSET],
    ] as const) {
      const [, y] = pointOf(-1, level, 'level-probe', w, h)
      expect(
        Math.abs(y - dy - expectedY),
        `${level} 档的理想纵坐标 ${y - dy} ≠ ${expectedY}（向上为正）`,
      ).toBeLessThan(1e-9)
    }
  })
})
