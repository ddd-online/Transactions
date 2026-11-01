/**
 * 数据落定那一拍：曲线沿自己的路径画出来（DESIGN.md「Draw the data」）。
 *
 * 两个图表（分析页的折线、股票统计的曲线）共用这一份时长与缓动 —— 同一条指数 ease-out，
 * 620ms；换成别的缓动就不再像"数据到账"，而是像一张图在表演。
 */
export const CHART_DRAW_ANIMATION = {
  type: 'pathIn',
  duration: 620,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const

/**
 * 系统偏好「减少动态」时不描线。
 *
 * 不能只靠 `base.css` 的全局兜底：那把动画时长压到 0.01ms，描到一半的路径会直接停在
 * 半路上（线只剩一截）。这里直接关掉动画，让曲线一次画完。
 */
export function motionAllowed(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}
