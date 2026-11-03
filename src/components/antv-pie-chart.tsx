import { memo, useEffect, useRef, type JSX } from 'react'
import { Chart } from '@antv/g2'

import type { PieSlice } from '../../shared/domain/pie'
import { chartTextTokens } from '../theme/chart-text'
import { motionAllowed } from '../theme/motion'

export interface AntvPieChartProps {
  slices: PieSlice[]
  /** 与 `slices` 一一对应的颜色（分类色板 / 交易类型语义色） */
  colors: string[]
  /** 各片金额之和（分）：用来算占比，也是「空数据」的判据之外唯一需要的总数 */
  total: number
  /** 这张饼图在说什么（例如「支出按分类」）：只进读屏名，不画在画布上 */
  label: string
}

/** 金额（分）→ 元：与折线图同一个口径，两位小数。 */
function yuan(cents: number): string {
  return (cents / 100).toFixed(2)
}

/**
 * AntV G2 饼图：只负责把后端算好的分组画出来。
 *
 * 与折线图同一套取舍：`memo` 必须留着（G2 建图是销毁 + 重建），画布内不画文字 ——
 * 分组名、金额与占比都在右侧那一列里，画布里再排文字会和中文标签撞在一起。
 *
 * 扇区之间留 1px 画布底色的缝：同色系的相邻分类（浅色主题下尤其）没有这条缝会糊成一片。
 */
export const AntvPieChart = memo(function AntvPieChart({
  slices,
  colors,
  total,
  label,
}: AntvPieChartProps): JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const ariaLabel =
    slices.length === 0
      ? `${label}：暂无数据`
      : `${label}：${slices
          .map((slice) => `${slice.label} ${yuan(slice.amount)} 元`)
          .join('，')}`
  /* 只有一组时不画饼：360° 的扇区在画布上会沿起始半径留一道 1px 的抗锯齿缝
   * （整圆看着像裂开了）。一个组就是一张实心圆，交给 CSS 画，边是干净的。 */
  const single = slices.length === 1

  useEffect(() => {
    const container = containerRef.current
    if (!container || single) return
    const rows = slices.map((slice) => ({
      key: slice.key,
      label: slice.label,
      amount: slice.amount / 100,
      share: total > 0 ? (slice.amount / total) * 100 : 0,
    }))
    const chart = new Chart({ container, autoFit: true, padding: 0 })
    chart.coordinate({ type: 'theta', outerRadius: 0.94 })
    chart.data(rows)
    chart.scale('color', { range: colors })
    chart.legend(false)
    chart.axis(false)
    const text = chartTextTokens()
    const interval = chart
      .interval()
      .transform({ type: 'stackY' })
      .encode('y', 'amount')
      .encode('color', 'label')
      // 只有一片时不要缝：1px 的底色描边会在整圆上留出一道「裂口」
      .style('stroke', slices.length > 1 ? text.canvasFill : 'transparent')
      .style('lineWidth', 1)
      /* 扇区必须与图例点同色。G2 默认给 interval 打 95% 的填充不透明度，
       * 5% 的底色混进来之后扇区比它的图例点浅一档，对画布的对比度也一起掉到 3:1 以下
       * （实测 #6d8acf → #7590d2）。面积档是按令牌算的，画出来就得是令牌那个值。 */
      .style('fillOpacity', 1)
      // 提示框只有一句：谁 + 多少钱 + 占比。不给 items 就不会排出 amount / share
      // 这种字段名和两枚同色圆点 —— 图例已经把这些都写在右边那一列了。
      .tooltip({
        title: (datum: Record<string, unknown>) =>
          `${String(datum.label ?? '')}　¥${Number(datum.amount ?? 0).toFixed(2)} · ` +
          `${Number(datum.share ?? 0).toFixed(2)}%`,
        items: false,
      })
    /* 这一页的「作者时刻」是折线沿着自己的路径画出来；饼图只做一个 220ms 的淡入，
     * 不转、不弹 —— 构图已经把话说完了。减少动态偏好下直接画完。 */
    if (motionAllowed()) {
      interval.animate('enter', {
        type: 'fadeIn',
        duration: 220,
        easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
      })
    } else {
      interval.animate(false)
    }
    chart.render()
    return () => {
      chart.destroy()
    }
  }, [colors, single, slices, total])

  return (
    <div
      className="antv-chart antv-chart--pie"
      data-testid="chart-pie"
      role="img"
      aria-label={ariaLabel}
      ref={containerRef}
    >
      {single ? (
        <span className="da-pie-single" style={{ background: colors[0] ?? 'transparent' }} />
      ) : null}
    </div>
  )
})
