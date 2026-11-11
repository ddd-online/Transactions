import { describe, expect, it } from 'vitest'

import { defaultView, NAV_VIEWS, resolveView, viewFeature, viewLabel } from '../../src/app-view'
import type { FeatureFlags } from '../../shared/types/config'

const allOn: FeatureFlags = {
  accounting: true,
  stock: true,
  keyEvent: true,
  diary: true,
  todo: true,
}

/** 一份把指定功能关掉的开关表。 */
function withOff(...keys: Array<keyof FeatureFlags>): FeatureFlags {
  const features = { ...allOn }
  for (const key of keys) features[key] = false
  return features
}

describe('默认页跟着功能开关走', () => {
  it('全开时仍是记账页（配置还没读到也按全开算）', () => {
    expect(defaultView(allOn)).toBe('accounting')
    expect(defaultView(null)).toBe('accounting')
  })

  it('关掉记账就落到导航里第一个还开着的功能，而不是停在记账', () => {
    expect(defaultView(withOff('accounting'))).toBe('stock')
    expect(defaultView(withOff('accounting', 'stock'))).toBe('todo')
    expect(defaultView(withOff('accounting', 'stock', 'todo'))).toBe('events')
    expect(defaultView(withOff('accounting', 'stock', 'todo', 'keyEvent'))).toBe('diary')
  })

  it('功能全关掉时只剩设置页', () => {
    expect(defaultView(withOff('accounting', 'stock', 'todo', 'keyEvent', 'diary'))).toBe('settings')
  })

  it('当前页被关掉时改渲染第一个开着的功能，开着的页原样返回', () => {
    expect(resolveView('accounting', withOff('accounting'))).toBe('stock')
    expect(resolveView('diary', withOff('accounting', 'stock', 'todo', 'keyEvent'))).toBe('diary')
    expect(resolveView('todo', withOff('accounting'))).toBe('todo')
    expect(resolveView('accounting', null)).toBe('accounting')
  })

  it('设置页不受开关约束', () => {
    expect(resolveView('settings', withOff('accounting'))).toBe('settings')
    expect(
      resolveView('settings', withOff('accounting', 'stock', 'todo', 'keyEvent', 'diary')),
    ).toBe('settings')
    expect(viewFeature('settings')).toBeNull()
  })

  it('导航顺序就是优先级，标题与开关一一对应', () => {
    expect(NAV_VIEWS.map((entry) => entry.view)).toEqual([
      'accounting',
      'stock',
      'todo',
      'events',
      'diary',
    ])
    expect(NAV_VIEWS.map((entry) => entry.label)).toEqual(['记账', '股票', '待办', '事件', '日记'])
    expect(NAV_VIEWS.map((entry) => entry.feature)).toEqual([
      'accounting',
      'stock',
      'todo',
      'keyEvent',
      'diary',
    ])
    expect(NAV_VIEWS.map((entry) => viewLabel(entry.view))).toEqual([
      '记账',
      '股票',
      '待办',
      '事件',
      '日记',
    ])
    expect(viewFeature('events')).toBe('keyEvent')
    expect(viewLabel('settings')).toBe('应用设置')
  })
})
