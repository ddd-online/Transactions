/**
 * 数据落定那一拍：曲线沿自己的路径画出来，饼图从起始角扫出来（DESIGN.md「Draw the data」）。
 *
 * 三个图表（分析页的折线、股票统计的曲线、分析页的饼图）共用这一份时长与缓动 ——
 * 同一条指数 ease-out，620ms；换成别的缓动就不再像"数据到账"，而是像一张图在表演。
 */

const DRAW_DURATION = 620
const DRAW_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)'

/** 折线：`pathIn` 让描边沿自己的路径从左到右长出来。 */
export const CHART_DRAW_ANIMATION = {
  type: 'pathIn',
  duration: DRAW_DURATION,
  easing: DRAW_EASING,
} as const

/**
 * 饼图：`waveIn` 是 G2 专门给极坐标写的那一支 —— 每一片从**自己的起始角**展开到结束角，
 * 同时把不透明度从 0 提上来，看着就是一只手顺时针把这张圆涂满。
 *
 * 不是 `growInY`（那是直角坐标的竖向擦除，落到饼图上像被切了一刀），也不是缩放：
 * 面积要"被画出来"，不是"弹出来"。
 */
export const CHART_PIE_ANIMATION = {
  type: 'waveIn',
  duration: DRAW_DURATION,
  easing: DRAW_EASING,
} as const

/**
 * 系统偏好「减少动态」时不描线、不扫盘。
 *
 * 不能只靠 `base.css` 的全局兜底：那把动画时长压到 0.01ms，描到一半的路径会直接停在
 * 半路上（线只剩一截）。这里直接关掉动画，让曲线一次画完。
 */
export function motionAllowed(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return true
  return !window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/**
 * 描线只在**看得清**的时候播。
 *
 * 620ms 是给「一条能顺着读下去的曲线」定的：十几个点，眼睛跟着走，看到的是数据在到账。
 * 采样点上百之后同一段时长里要画完一条几百段的折线，看到的只是面积在闪，代价则是
 * 每一帧把整块画布重绘一遍 —— 股票统计页 400 个采样实测光是这张图的动画就吃掉约 80ms
 * 主线程（`syncHierarchy` + `render2` 各帧累加）。所以超过这个密度就直接画完：
 * 数据是同一份，只是不再表演它怎么长出来。
 */
export const CHART_DRAW_MAX_POINTS = 120

export function shouldAnimateDraw(pointCount: number): boolean {
  return motionAllowed() && pointCount <= CHART_DRAW_MAX_POINTS
}
