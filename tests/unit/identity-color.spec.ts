import { describe, expect, it } from 'vitest'

import { IDENTITY_TONES, identityColor, identityTone } from '../../shared/domain/identity-color'

describe('identity-color', () => {
  it('同一个 seed 始终落到同一个色', () => {
    expect(identityTone('ledger-1')).toBe(identityTone('ledger-1'))
    expect(identityColor('ledger-1')).toBe(`var(--transactions-ledger-${identityTone('ledger-1')})`)
  })

  it('八个色都可能出现', () => {
    const seen = new Set<string>()
    for (let index = 0; index < 200; index += 1) {
      seen.add(identityTone(`seed-${index}`))
    }
    expect([...seen].sort()).toEqual([...IDENTITY_TONES].sort())
  })

  it('不同 seed 可以落到不同身份', () => {
    expect(identityTone('ledger-1')).not.toBe(identityTone('ledger-1:event'))
  })

  it('返回的是 token 引用，不是裸色值', () => {
    expect(identityColor('anything')).toMatch(/^var\(--transactions-ledger-[a-z-]+\)$/)
  })
})
