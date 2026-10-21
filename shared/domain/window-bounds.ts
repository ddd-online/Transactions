import type { AppConfig } from '../types/config'

export interface WorkArea {
  x: number
  y: number
  width: number
  height: number
}

export interface FittedBounds {
  width: number
  height: number
  x: number
  y: number
}

const MARGIN = 8

/** 把保存的窗口尺寸/位置夹到当前显示器工作区内，避免三键跑到屏幕外。 */
export function fitWindowBounds(
  saved: Pick<AppConfig, 'width' | 'height' | 'x' | 'y'>,
  area: WorkArea,
): FittedBounds {
  const width = Math.max(800, Math.min(saved.width, Math.max(800, area.width - MARGIN * 2)))
  const height = Math.max(600, Math.min(saved.height, Math.max(600, area.height - MARGIN * 2)))
  const minX = area.x + MARGIN
  const maxX = Math.max(minX, area.x + area.width - width - MARGIN)
  const minY = area.y + MARGIN
  const maxY = Math.max(minY, area.y + area.height - height - MARGIN)
  const x = saved.x == null ? Math.round(area.x + (area.width - width) / 2) : Math.min(Math.max(saved.x, minX), maxX)
  const y = saved.y == null ? Math.round(area.y + (area.height - height) / 2) : Math.min(Math.max(saved.y, minY), maxY)
  return { width, height, x, y }
}
