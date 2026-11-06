import { useCallback, useEffect, useState } from 'react'

import type { TimeRangeMode } from '../components/time-range-picker'

export interface SessionTimeRange {
  mode: TimeRangeMode
  start: string
  end: string
}

/**
 * 本次运行期间的时间范围：切页会卸载页面组件，`useState` 存不住；写进模块级 Map 就还在。
 *
 * 只活在这个渲染进程里 —— 重开应用回到各页自己的默认范围。「打开期间不丢」正是这么定的：
 * 时间范围是一次浏览的上下文，不是要跨启动复用的偏好（那类设置走 config）。
 * 股票天梯不接这个：它默认落在最近交易日，记住上一次翻到的旧日子只会看到空数据。
 */
const memory = new Map<string, SessionTimeRange>()

/** 读某页记住的范围（没记过 = `undefined`，由调用方给默认值）。 */
export function rememberedTimeRange(key: string): SessionTimeRange | undefined {
  return memory.get(key)
}

/** 记住某页当前的范围。 */
export function rememberTimeRange(key: string, range: SessionTimeRange): void {
  memory.set(key, range)
}

/** 清掉全部记忆（重开应用不可能发生在这里，只有测试需要）。 */
export function forgetTimeRanges(): void {
  memory.clear()
}

/**
 * 页面级时间范围状态：初始值优先取本次运行的记忆，之后每次变化都记回去。
 *
 * `key` 按页面分开记 —— 记录页默认今天、分析页默认本年，两页各记各的，
 * 切页回来仍是自己上一眼看到的那段范围。
 */
export function useSessionTimeRange(
  key: string,
  defaults: () => SessionTimeRange,
): [SessionTimeRange, (patch: Partial<SessionTimeRange>) => void] {
  const [range, setRange] = useState<SessionTimeRange>(
    () => rememberedTimeRange(key) ?? defaults(),
  )
  const update = useCallback((patch: Partial<SessionTimeRange>): void => {
    setRange((current) => ({ ...current, ...patch }))
  }, [])
  useEffect(() => {
    // 只记住选完的那一段：半选（只有起点）是正在挑的中间态 —— 切页回来留一张空图表，
    // 比回到上一段完整范围更糟。
    if (!range.start || !range.end) return
    rememberTimeRange(key, range)
  }, [key, range])
  return [range, update]
}
