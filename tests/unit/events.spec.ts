import { describe, expect, it } from 'vitest'

import { ALL } from '../../shared/events'

describe('event names', () => {
  it('are unique', () => {
    expect(new Set(ALL).size).toBe(ALL.length)
  })

  it('keep the legacy names without a namespace', () => {
    expect(ALL).toContain('workspace-changed')
    expect(ALL).toContain('window-state-changed')
  })

  it('use namespace:action for new names', () => {
    for (const name of ALL) {
      if (name === 'workspace-changed' || name === 'window-state-changed') continue
      expect(name).toMatch(/^[a-z-]+:[a-z-]+$/)
    }
  })
})
