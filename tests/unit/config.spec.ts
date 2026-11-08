import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { ConfigStore, defaultConfig, normalizeConfig } from '../../electron/config'
import { defaultBackupDir } from '../../shared/domain/backup'

const directories: string[] = []

function temporaryFile(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-config-test-'))
  directories.push(directory)
  return join(directory, '.tr.json')
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
    expect(config.closeBehavior).toBe('ask')
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
    expect(config.chartSummaryCollapsed).toBe(false)
    // 数据安全底座的三个新键
    expect(config.backupDir).toBe('')
    expect(config.autoBackup).toBe(true)
    expect(config.recentWorkspaces).toEqual([])
  })

  it('missing keys fall back to defaults (old config files)', () => {
    const config = normalizeConfig({ width: 800, workspaceDir: 'D:\\ws' })
    expect(config.width).toBe(800)
    expect(config.workspaceDir).toBe('D:\\ws')
    expect(config.height).toBe(1000)
    expect(config.features.accounting).toBe(true)
    expect(config.chartSummaryCollapsed).toBe(false)
    // 老配置文件里没有这三个键：按默认值回落，而不是 undefined
    expect(config.backupDir).toBe('')
    expect(config.autoBackup).toBe(true)
    expect(config.recentWorkspaces).toEqual([])
  })

  // 配置是用户数据，脏输入（手改、别的版本写的）不能让设置页崩掉，
  // 归一化在读取侧兜住：非数组 → 空表，空串 / 非字符串丢掉，重复去重，超 5 条截断。
  it('normalizes dirty recent workspaces', () => {
    expect(normalizeConfig({ recentWorkspaces: 'D:\\a' }).recentWorkspaces).toEqual([])
    expect(normalizeConfig({ recentWorkspaces: null }).recentWorkspaces).toEqual([])
    expect(
      normalizeConfig({ recentWorkspaces: ['D:\\a', '', 3, 'D:\\a', '  ', 'D:\\b'] })
        .recentWorkspaces,
    ).toEqual(['D:\\a', 'D:\\b'])
    expect(
      normalizeConfig({
        recentWorkspaces: ['D:\\1', 'D:\\2', 'D:\\3', 'D:\\4', 'D:\\5', 'D:\\6'],
      }).recentWorkspaces,
    ).toEqual(['D:\\1', 'D:\\2', 'D:\\3', 'D:\\4', 'D:\\5'])
  })

  it('normalizes a dirty auto backup flag', () => {
    expect(normalizeConfig({ autoBackup: false }).autoBackup).toBe(false)
    expect(normalizeConfig({ autoBackup: 'yes' }).autoBackup).toBe(true)
    expect(normalizeConfig({ backupDir: 7 }).backupDir).toBe('')
  })

  // 关闭行为只认 quit / tray / ask：老配置里的空值和不认识的值都归到「每次询问」，
  // 否则设置页那一行会一个都没选中，看起来就像设置不生效。
  it('close behavior is normalized to one of the three options', () => {
    expect(normalizeConfig({}).closeBehavior).toBe('ask')
    expect(normalizeConfig({ closeBehavior: '' }).closeBehavior).toBe('ask')
    expect(normalizeConfig({ closeBehavior: 'ask' }).closeBehavior).toBe('ask')
    expect(normalizeConfig({ closeBehavior: 'quit' }).closeBehavior).toBe('quit')
    expect(normalizeConfig({ closeBehavior: 'tray' }).closeBehavior).toBe('tray')
    expect(normalizeConfig({ closeBehavior: 'minimize' }).closeBehavior).toBe('ask')
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
        sourceNumber: 7,
      }),
      'utf8',
    )

    const store = new ConfigStore({ path, isDev: true })
    store.update((config) => {
      config.closeBehavior = 'tray'
      config.sidebarCollapsed = true
      config.chartSummaryCollapsed = true
    })

    const reloaded = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    expect(reloaded.width).toBe(800)
    expect(reloaded.closeBehavior).toBe('tray')
    expect(reloaded.sidebarCollapsed).toBe(true)
    expect(reloaded.chartSummaryCollapsed).toBe(true)
    expect(reloaded.futureFeature).toEqual({ enabled: true })
    expect(reloaded.sourceNumber).toBe(7)
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

  it('writes the three data safety keys back and keeps unknown keys', () => {
    const path = temporaryFile()
    writeFileSync(path, JSON.stringify({ width: 800, futureFeature: { enabled: true } }), 'utf8')

    const store = new ConfigStore({ path, isDev: true })
    store.update((config) => {
      config.backupDir = 'E:\\我的备份'
      config.autoBackup = false
      config.recentWorkspaces = ['D:\\ws-b', 'D:\\ws-a']
    })

    const reloaded = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    expect(reloaded.backupDir).toBe('E:\\我的备份')
    expect(reloaded.autoBackup).toBe(false)
    expect(reloaded.recentWorkspaces).toEqual(['D:\\ws-b', 'D:\\ws-a'])
    expect(reloaded.futureFeature).toEqual({ enabled: true })
    expect(reloaded.width).toBe(800)
  })

  it('resolves the snapshot backup directory against the documents folder', () => {
    const path = temporaryFile()

    // 配置里是空串 = 「文档」下的默认目录；快照永远给解析后的绝对路径
    const store = new ConfigStore({ path, isDev: true, documentsDir: 'D:\\Documents' })
    expect(store.get().backupDir).toBe('')
    expect(store.backupDir()).toBe(defaultBackupDir('D:\\Documents'))
    expect(store.snapshot().backupDir).toBe(defaultBackupDir('D:\\Documents'))

    store.update((config) => {
      config.backupDir = 'E:\\备份'
      config.recentWorkspaces = ['D:\\ws']
    })
    expect(store.backupDir()).toBe('E:\\备份')
    expect(store.snapshot().backupDir).toBe('E:\\备份')
    expect(store.snapshot().autoBackup).toBe(true)
    expect(store.snapshot().recentWorkspaces).toEqual(['D:\\ws'])
  })

  it('falls back to the documents default when backupDir is only whitespace', () => {
    const path = temporaryFile()
    writeFileSync(path, JSON.stringify({ backupDir: '   ' }), 'utf8')
    const store = new ConfigStore({ path, isDev: true, documentsDir: 'D:\\Documents' })
    expect(store.backupDir()).toBe(defaultBackupDir('D:\\Documents'))
  })
})
