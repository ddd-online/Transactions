import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import type { AppConfig, ConfigSnapshot, FeatureFlags, ProxySetting } from '../shared/types/config'
import { defaultFeatures, defaultProxy } from '../shared/types/config'
import { CLOSE_BEHAVIOR_ASK, normalizeCloseBehavior } from '../shared/domain/consts'
import { normalizeRecentWorkspaces, resolveBackupDir } from '../shared/domain/backup'

export const CONFIG_FILE = '.tr.json'
export const CONFIG_FILE_DEV = '.tr.dev.json'

export function configPath(isDev: boolean): string {
  return join(homedir(), isDev ? CONFIG_FILE_DEV : CONFIG_FILE)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value : fallback
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optionalNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function boolOr(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeFlags(value: unknown, fallback: FeatureFlags): FeatureFlags {
  if (!isRecord(value)) return { ...fallback }
  return {
    accounting: boolOr(value.accounting, fallback.accounting),
    stock: boolOr(value.stock, fallback.stock),
    keyEvent: boolOr(value.keyEvent, fallback.keyEvent),
    diary: boolOr(value.diary, fallback.diary),
    todo: boolOr(value.todo, fallback.todo),
  }
}

function normalizeProxy(value: unknown): ProxySetting {
  if (!isRecord(value)) return defaultProxy()
  const mode = stringOr(value.mode, 'auto')
  return {
    mode: mode === 'off' || mode === 'manual' ? mode : 'auto',
    url: stringOr(value.url, ''),
  }
}

function normalizeLedgerFeatures(value: unknown): Record<string, FeatureFlags> {
  if (!isRecord(value)) return {}
  const result: Record<string, FeatureFlags> = {}
  for (const [ledgerId, flags] of Object.entries(value)) {
    result[ledgerId] = normalizeFlags(flags, defaultFeatures())
  }
  return result
}

export function defaultConfig(): AppConfig {
  return {
    width: 1500,
    height: 1000,
    x: null,
    y: null,
    workspaceDir: '',
    closeBehavior: CLOSE_BEHAVIOR_ASK,
    appearance: 'system',
    proxy: defaultProxy(),
    features: defaultFeatures(),
    ledgerFeatures: {},
    keyEventLinkedOpen: true,
    sidebarCollapsed: false,
    chartSummaryCollapsed: false,
    dataVersion: 2,
    backupDir: '',
    autoBackup: true,
    recentWorkspaces: [],
  }
}

export function normalizeConfig(raw: Record<string, unknown>): AppConfig {
  const defaults = defaultConfig()
  return {
    width: numberOr(raw.width, defaults.width),
    height: numberOr(raw.height, defaults.height),
    x: optionalNumber(raw.x),
    y: optionalNumber(raw.y),
    workspaceDir: stringOr(raw.workspaceDir, defaults.workspaceDir),
    closeBehavior: normalizeCloseBehavior(raw.closeBehavior),
    appearance: stringOr(raw.appearance, defaults.appearance),
    proxy: normalizeProxy(raw.proxy),
    features: normalizeFlags(raw.features, defaults.features),
    ledgerFeatures: normalizeLedgerFeatures(raw.ledgerFeatures),
    keyEventLinkedOpen: boolOr(raw.keyEventLinkedOpen, defaults.keyEventLinkedOpen),
    sidebarCollapsed: boolOr(raw.sidebarCollapsed, defaults.sidebarCollapsed),
    chartSummaryCollapsed: boolOr(raw.chartSummaryCollapsed, defaults.chartSummaryCollapsed),
    dataVersion: numberOr(raw.dataVersion, defaults.dataVersion),
    // 备份位置保留 raw 里的空串（空串 = 默认目录）；最近工作空间是用户数据，脏值逐条丢掉
    backupDir: stringOr(raw.backupDir, defaults.backupDir),
    autoBackup: boolOr(raw.autoBackup, defaults.autoBackup),
    recentWorkspaces: normalizeRecentWorkspaces(raw.recentWorkspaces),
  }
}

function serializeConfig(config: AppConfig): Record<string, unknown> {
  return {
    width: config.width,
    height: config.height,
    x: config.x,
    y: config.y,
    workspaceDir: config.workspaceDir,
    closeBehavior: config.closeBehavior,
    appearance: config.appearance,
    proxy: config.proxy,
    features: config.features,
    ledgerFeatures: config.ledgerFeatures,
    keyEventLinkedOpen: config.keyEventLinkedOpen,
    sidebarCollapsed: config.sidebarCollapsed,
    chartSummaryCollapsed: config.chartSummaryCollapsed,
    dataVersion: config.dataVersion,
    backupDir: config.backupDir,
    autoBackup: config.autoBackup,
    recentWorkspaces: config.recentWorkspaces,
  }
}

function readRaw(path: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'))
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeRaw(path: string, raw: Record<string, unknown>): void {
  const text = `${JSON.stringify(raw, null, 2)}\n`
  const temporary = `${path}.tmp`
  writeFileSync(temporary, text, 'utf8')
  try {
    renameSync(temporary, path)
  } catch {
    writeFileSync(path, text, 'utf8')
  }
}

/** 配置持有者：读写同一文件、保留未知键（升级/降级不抹掉别的版本写的键）。 */
export class ConfigStore {
  readonly path: string
  readonly isDev: boolean
  /** 「文档」目录：解析默认备份位置用；主进程注入，测试可换 */
  readonly documentsDir: string
  private raw: Record<string, unknown>
  private config: AppConfig

  constructor(options: { path: string; isDev: boolean; documentsDir?: string }) {
    this.path = options.path
    this.isDev = options.isDev
    this.documentsDir = options.documentsDir ?? join(homedir(), 'Documents')
    this.raw = readRaw(options.path)
    this.config = normalizeConfig(this.raw)
  }

  /** 生产用入口；`documentsDir` 由主进程给（`app.getPath('documents')`），不 import electron。 */
  static forApp(isDev: boolean, documentsDir?: string): ConfigStore {
    return new ConfigStore({ path: configPath(isDev), isDev, documentsDir })
  }

  get(): AppConfig {
    return structuredClone(this.config)
  }

  /** 解析后的备份位置：绝对路径，永远非空（raw 是空串时取「文档」下的默认目录）。 */
  backupDir(): string {
    return resolveBackupDir(this.config.backupDir, this.documentsDir)
  }

  snapshot(): ConfigSnapshot {
    return {
      workspaceDir: this.config.workspaceDir,
      closeBehavior: this.config.closeBehavior,
      appearance: this.config.appearance,
      configPath: this.path,
      isDev: this.isDev,
      proxy: structuredClone(this.config.proxy),
      features: structuredClone(this.config.features),
      ledgerFeatures: structuredClone(this.config.ledgerFeatures),
      keyEventLinkedOpen: this.config.keyEventLinkedOpen,
      sidebarCollapsed: this.config.sidebarCollapsed,
      chartSummaryCollapsed: this.config.chartSummaryCollapsed,
      // 与 raw 里的 backupDir 不同：快照给的是解析后的绝对路径
      backupDir: this.backupDir(),
      autoBackup: this.config.autoBackup,
      recentWorkspaces: structuredClone(this.config.recentWorkspaces),
    }
  }

  update<T>(edit: (config: AppConfig) => T): T {
    const result = edit(this.config)
    this.raw = { ...this.raw, ...serializeConfig(this.config) }
    writeRaw(this.path, this.raw)
    return result
  }
}

/** 测试与工具用：确保父目录存在。 */
export function ensureConfigDirectory(path: string): void {
  mkdirSync(path, { recursive: true })
}
