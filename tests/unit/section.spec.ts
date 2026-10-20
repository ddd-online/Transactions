import { describe, expect, it } from 'vitest'

import {
  SectionState,
  sectionState,
  sectionStateKeepingContent,
} from '../../shared/domain/section'

describe('section state', () => {
  // 首帧：还没跑完（loading 也还是 false）→ 加载中，**不能**判成空。
  it('the first frame is loading not empty', () => {
    expect(sectionState(true, false, false, null)).toBe(SectionState.Loading)
    expect(sectionState(true, false, false, '炸了')).toBe(SectionState.Loading)
  })

  // 失败不是空：跑完了、手上没数据、有失败文案 → Failed。
  it('a failure is never rendered as an empty list', () => {
    expect(sectionState(true, false, true, '查询已清仓股票失败')).toBe(SectionState.Failed)
    // 同上，但手上还留着上一次的结果（keep_stale 那类页面）：仍然是失败态
    expect(sectionState(false, false, true, '查询失败')).toBe(SectionState.Failed)
  })

  // 重试期间显示加载：手上那份错已经过期。
  it('a retry in flight shows loading rather than the stale error', () => {
    expect(sectionState(true, true, true, '上一次失败了')).toBe(SectionState.Loading)
  })

  // 跑完了、没有失败、没有数据 → 空态。
  it('a loaded empty list is the empty state', () => {
    expect(sectionState(true, false, true, null)).toBe(SectionState.Empty)
    // 失败被清掉之后（重试成功但确实没数据）也回到空态
    expect(sectionState(true, false, true, null)).toBe(SectionState.Empty)
  })

  it('a loaded list with items is ready', () => {
    expect(sectionState(false, false, true, null)).toBe(SectionState.Ready)
    // 重拉中仍显示加载（手上有数据也不闪回内容）
    expect(sectionState(false, true, true, null)).toBe(SectionState.Loading)
  })

  // 「重拉不塌内容」：手上有内容时不显示加载态，其余三态与 sectionState 完全一致。
  it('keeping content only overrides the loading branch', () => {
    // 重拉中（手上有内容）⇒ Ready：这是这条规则存在的唯一理由
    expect(sectionStateKeepingContent(false, true, true, null)).toBe(SectionState.Ready)
    // 首帧（还没跑完一次、手上也没有内容）⇒ 仍然是 Loading
    expect(sectionStateKeepingContent(true, false, false, null)).toBe(SectionState.Loading)
    // 手上**有**内容（keep 那类缓存的页面）⇒ 哪怕还没跑完一次也先显示它
    expect(sectionStateKeepingContent(false, false, false, null)).toBe(SectionState.Ready)
    // 手上没有内容时与 sectionState 逐字一致（重拉 / 跑完为空 / 失败）
    for (const itemsEmpty of [true, false]) {
      for (const loading of [false, true]) {
        for (const failed of [null, '查询失败']) {
          for (const loaded of [false, true]) {
            if (!itemsEmpty) {
              continue // 有内容那一侧由上面两条断言覆盖
            }
            expect(
              sectionStateKeepingContent(itemsEmpty, loading, loaded, failed),
              `items_empty=${itemsEmpty} loading=${loading} loaded=${loaded} failed=${failed}`,
            ).toBe(sectionState(itemsEmpty, loading, loaded, failed))
          }
        }
      }
    }
    // 失败优先：有内容但这次取数失败了 ⇒ Failed（不拿旧内容掩盖失败）
    expect(sectionStateKeepingContent(false, false, true, '查询待办失败')).toBe(
      SectionState.Failed,
    )
  })

  // 16 种输入组合里，四态各自都该出现，且优先级不随 itemsEmpty 变。
  it('the precedence holds for every combination', () => {
    for (const itemsEmpty of [true, false]) {
      for (const loading of [true, false]) {
        for (const loaded of [true, false]) {
          for (const failed of [null, '失败']) {
            const state = sectionState(itemsEmpty, loading, loaded, failed)
            const expected =
              loading || !loaded
                ? SectionState.Loading
                : failed !== null
                  ? SectionState.Failed
                  : itemsEmpty
                    ? SectionState.Empty
                    : SectionState.Ready
            expect(
              state,
              `items_empty=${itemsEmpty} loading=${loading} loaded=${loaded} failed=${failed}`,
            ).toBe(expected)
          }
        }
      }
    }
    // 四态都被覆盖到
    const seen = new Set([
      sectionState(true, false, false, null),
      sectionState(true, false, true, '失败'),
      sectionState(true, false, true, null),
      sectionState(false, false, true, null),
    ])
    expect(seen.size).toBe(4)
  })
})
