import { describe, expect, it } from 'vitest'

import { writeTarget } from '../../shared/domain/change'

describe('write target', () => {
  it('the same ledger is not stale', () => {
    const target = writeTarget('ledger-a')
    expect(target.isStale('ledger-a')).toBe(false)
    expect(target.ledgerId).toBe('ledger-a')
  })

  it('switching the ledger makes the write stale', () => {
    const target = writeTarget('ledger-a')
    expect(target.isStale('ledger-b'), '旧账本的写不该落到新账本上').toBe(true)
    expect(target.isStale(''), '切到「没有账本」也算过期').toBe(true)
  })

  // 还没选账本就发出去的写永远算过期（后端迟早会拒，落地只会闪出旧数据）。
  it('a write without a ledger is always stale', () => {
    const target = writeTarget('')
    expect(target.isStale('')).toBe(true)
    expect(target.isStale('ledger-a'), '连事后选中了别的账本也不算它的').toBe(true)
  })

  // 判定是"纯比较"：同一对入参永远同一个答案（调用点可以放心在异步块里用）。
  it('the rule is pure', () => {
    const target = writeTarget('ledger-a')
    for (let round = 0; round < 3; round += 1) {
      expect(target.isStale('ledger-a')).toBe(false)
      expect(target.isStale('ledger-b')).toBe(true)
    }
  })
})
