import { describe, expect, it } from 'vitest'

import { QueryCore, unchanged, type Step } from '../../shared/domain/query'

/** Rust 测试里的 `fetch` 辅助：只关心发出去的 key。 */
function fetchKey(step: Step<string>): string | null {
  return step.type === 'fetch' ? step.key : null
}

const IDLE = { type: 'idle' } as const
const CLEAR = { type: 'clear' } as const

describe('QueryCore', () => {
  it('mount fetches and observe dedupes the same key', () => {
    const core = new QueryCore<string>()
    expect(fetchKey(core.mount('A'))).toBe('A')
    // 视图重建：同一份 key 不再发
    expect(core.observe('A')).toEqual(IDLE)
    expect(core.observe('A')).toEqual(IDLE)
    // 换 key → 发
    expect(fetchKey(core.observe('B'))).toBe('B')
    expect(core.observe('B')).toEqual(IDLE)
  })

  it('mount revalidates even for the same key', () => {
    const core = new QueryCore<string>()
    expect(fetchKey(core.mount('A'))).toBe('A')
    expect(core.settle('A', 0)).toBe(true)
    // 从别的子功能切回来：同一份 key 也复核一次
    expect(fetchKey(core.mount('A'))).toBe('A')
  })

  it('in-flight same key is deduped', () => {
    const core = new QueryCore<string>()
    expect(fetchKey(core.mount('A'))).toBe('A')
    // 还没回来就又挂载（视图重建）→ 不再发第二份
    expect(core.mount('A')).toEqual(IDLE)
    expect(core.observe('A')).toEqual(IDLE)
    expect(core.settle('A', 0)).toBe(true)
    // 回来之后再挂载 → 复核
    expect(fetchKey(core.mount('A'))).toBe('A')
  })

  it('reload forces one more request', () => {
    const core = new QueryCore<string>()
    expect(fetchKey(core.mount('A'))).toBe('A')
    expect(core.settle('A', 0)).toBe(true)
    expect(core.observe('A')).toEqual(IDLE)
    // 变更后重拉：key 没变也发一次
    expect(core.reload('A')).toEqual({ type: 'fetch', key: 'A', generation: 1 })
    expect(core.generation()).toBe(1)
    expect(core.settle('A', 1)).toBe(true)
    expect(core.observe('A')).toEqual(IDLE)
    // 不会连着发两次
    expect(core.observe('A')).toEqual(IDLE)
  })

  it('none key clears once and never fetches', () => {
    const core = new QueryCore<string>()
    // 一开始就没有 key（还没选账本）：清空一次对外状态 —— 界面据此显示
    // "确实是空"，而不是永远停在"正在加载"。
    expect(core.mount(null)).toEqual(CLEAR)
    expect(core.currentKey).toBeNull()
    // 之后的每次重渲染不再重复清
    expect(core.observe(null)).toEqual(IDLE)
    expect(fetchKey(core.mount('A'))).toBe('A')
    expect(core.currentKey).toBe('A')
    expect(core.settle('A', 0)).toBe(true)
    // 账本被清空 → 清空对外状态
    expect(core.observe(null)).toEqual(CLEAR)
    expect(core.currentKey).toBeNull()
    // 清完再来一次就不再重复清
    expect(core.observe(null)).toEqual(IDLE)
  })

  it('stale result is rejected after key change', () => {
    const core = new QueryCore<string>()
    expect(fetchKey(core.mount('A'))).toBe('A')
    // 请求还在飞，key 就换了
    expect(fetchKey(core.observe('B'))).toBe('B')
    // A 的结果回来时已经过期
    expect(core.settle('A', 0)).toBe(false)
    // B 的才是当前那一份
    expect(core.settle('B', 0)).toBe(true)
  })

  it('failure clears served so the next observe retries', () => {
    const core = new QueryCore<string>()
    expect(fetchKey(core.mount('A'))).toBe('A')
    expect(core.settle('A', 0)).toBe(true)
    core.failed('A', 0)
    // 失败后没有"刷新"按钮也要能再试一次
    expect(fetchKey(core.observe('A'))).toBe('A')
  })

  it('failure after key change does not clobber the new key', () => {
    const core = new QueryCore<string>()
    expect(fetchKey(core.mount('A'))).toBe('A')
    expect(fetchKey(core.observe('B'))).toBe('B')
    // A 的失败不该把 B 的"已发过"撤掉
    core.failed('A', 0)
    expect(core.settle('A', 0)).toBe(false)
    expect(core.settle('B', 0)).toBe(true)
    expect(core.observe('B')).toEqual(IDLE)
  })

  it('view rebuild storm issues at most one request per round', () => {
    // 自激循环的回归：视图被反复重建（每轮一次 mount），若没有去重就是请求风暴。
    const core = new QueryCore<string>()
    expect(fetchKey(core.mount('A'))).toBe('A')
    // 请求还没回来，视图又重建了 30 次
    for (let rebuild = 0; rebuild < 30; rebuild += 1) {
      expect(core.mount('A')).toEqual(IDLE)
    }
    expect(core.settle('A', 0)).toBe(true)
  })
})

describe('unchanged', () => {
  it('unchanged detects identical revalidation', () => {
    const current = [1, 2, 3]
    expect(unchanged(current, [1, 2, 3])).toBe(true)
    expect(unchanged(current, [1, 2])).toBe(false)
    expect(unchanged(null, [1])).toBe(false)
    // TS 没有 PartialEq：对象也按结构比较（同值复核不该再写一次信号）
    expect(unchanged({ ledgerId: 'a', year: 2026 }, { ledgerId: 'a', year: 2026 })).toBe(true)
  })
})
