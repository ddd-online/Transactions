import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ConfigStore, defaultConfig, normalizeConfig } from '../../electron/config'

const directories: string[] = []

function temporaryFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-config-test-'))
  directories.push(directory)
  return join(directory, '.transactions.json')
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('config normalization', () => {
  it('defaults match the documented initial values', () => {
    const config = defaultConfig()
    expect(config.width).toBe(1500)
    expect(config.height).toBe(1000)
    expect(config.appearance).toBe('system')
    expect(config.workspaceDir).toBe('')
    expect(config.closeBehavior).toBe('')
    expect(config.proxy.mode).toBe('auto')
    expect(config.features).toEqual({
      accounting: true,
      stock: true,
      keyEvent: true,
      diary: true,
      todo: true,
    })
    expect(config.keyEventLinkedOpen).toBe(true)
    expect(config.sidebarCollapsed).toBe(false)
  })

  it('missing keys fall back to defaults (old config files)', () => {
    const config = normalizeConfig({ width: 800, workspaceDir: 'D:\\ws' })
    expect(config.width).toBe(800)
    expect(config.workspaceDir).toBe('D:\\ws')
    expect(config.height).toBe(1000)
    expect(config.features.accounting).toBe(true)
  })

  it('partial feature flags and ledgerFeatures are normalized', () => {
    const config = normalizeConfig({
      features: { stock: false },
      ledgerFeatures: { 'ledger-a': { diary: false } },
    })
    expect(config.features.stock).toBe(false)
    expect(config.features.accounting).toBe(true)
    expect(config.ledgerFeatures['ledger-a']?.diary).toBe(false)
    expect(config.ledgerFeatures['ledger-a']?.stock).toBe(true)
  })
})

describe('config store', () => {
  it('preserves unknown keys across a save roundtrip', () => {
    const path = temporaryFile()
    writeFileSync(
      path,
      JSON.stringify({
        width: 800,
        workspaceDir: 'D:\\ws',
        futureFeature: { enabled: true },
        legacyNumber: 7,
      }),
      'utf8',
    )

    const store = new ConfigStore({ path, isDev: true })
    store.update((config) => {
      config.closeBehavior = 'tray'
      config.sidebarCollapsed = true
    })

    const reloaded = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    expect(reloaded.width).toBe(800)
    expect(reloaded.closeBehavior).toBe('tray')
    expect(reloaded.sidebarCollapsed).toBe(true)
    expect(reloaded.futureFeature).toEqual({ enabled: true })
    expect(reloaded.legacyNumber).toBe(7)
  })

  it('returns a snapshot with configPath and isDev', () => {
    const path = temporaryFile()
    const store = new ConfigStore({ path, isDev: true })
    const snapshot = store.snapshot()
    expect(snapshot.configPath).toBe(path)
    expect(snapshot.isDev).toBe(true)
    expect(snapshot.appearance).toBe('system')
  })

  it('falls back to defaults for a broken file', () => {
    const path = temporaryFile()
    writeFileSync(path, '{ not json', 'utf8')
    const store = new ConfigStore({ path, isDev: false })
    expect(store.get().width).toBe(1500)
  })
})
