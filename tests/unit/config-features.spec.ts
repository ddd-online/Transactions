import { describe, expect, it } from 'vitest'

import { defaultConfig } from '../../electron/config'
import { setFeatureIn } from '../../electron/services/config'
import { AppError } from '../../shared/errors'

describe('feature flags', () => {
  it('edits the default scope when no ledger is given', () => {
    const config = defaultConfig()
    const features = setFeatureIn(config, '', 'stock', false)
    expect(features.stock).toBe(false)
    expect(config.features.stock).toBe(false)
    expect(config.ledgerFeatures).toEqual({})
  })

  it('copies the defaults into a ledger scope on first edit', () => {
    const config = defaultConfig()
    const features = setFeatureIn(config, 'ledger-a', 'diary', false)
    expect(features).toEqual({ ...config.features, diary: false })
    expect(config.ledgerFeatures['ledger-a']?.diary).toBe(false)
    expect(config.features.diary).toBe(true)
  })

  it('keeps other ledger scopes independent', () => {
    const config = defaultConfig()
    setFeatureIn(config, 'a', 'todo', false)
    setFeatureIn(config, 'b', 'keyEvent', false)
    expect(config.ledgerFeatures.a?.todo).toBe(false)
    expect(config.ledgerFeatures.a?.keyEvent).toBe(true)
    expect(config.ledgerFeatures.b?.todo).toBe(true)
    expect(config.ledgerFeatures.b?.keyEvent).toBe(false)
  })

  it('rejects unknown feature names', () => {
    const config = defaultConfig()
    try {
      setFeatureIn(config, '', 'nope', false)
      throw new Error('应当抛错')
    } catch (error) {
      expect(error).toBeInstanceOf(AppError)
      expect((error as AppError).status).toBe(400)
      expect((error as AppError).message).toBe('无效的功能开关')
    }
  })
})
