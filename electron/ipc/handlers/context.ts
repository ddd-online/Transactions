/**
 * 命令层各领域共享的上下文。
 *
 * 这里只放跨领域复用的构造与小工具：配置、备份服务、更新服务、数据库句柄、
 * 行情 / 涨停数据源、重启。领域文件通过 `HandlerContext` 显式拿到它们，
 * 不各自 new 一份，也不从兄弟模块的闭包里抓。
 */
import { app, shell } from 'electron'

import { nowSeconds } from '../../../shared/domain/time'
import { AppError, workspaceNotOpened } from '../../../shared/errors'
import type { ConfigStore } from '../../config'
import { closeWorkspace, currentWorkspace } from '../../db'
import type { Db } from '../../db/driver'
import { MIGRATIONS } from '../../db/migrate'
import { logWarn } from '../../logging'
import { createBackupService, type BackupService } from '../../services/backup'
import { EastmoneyLimitPoolSource } from '../../services/stock-limit-pool'
import { TencentStockQuoteFetcher } from '../../services/stock-quote'
import { UpdaterService } from '../../services/updater'
import { appFetch } from '../../shell/net'
import { quitApp } from '../../shell/window'
import { sendEvent } from '../events'

export interface HandlerContext {
  config: ConfigStore
  backup: BackupService
  updater: UpdaterService
}

const updater = new UpdaterService({
  fetchImpl: (input, init) => appFetch(input, init as RequestInit),
  releaseApi: process.env.TRANSACTIONS_TEST_RELEASE_API,
  tempDir: process.env.TRANSACTIONS_TEST_UPDATE_DIR,
  onEvent: (event, snapshot) => sendEvent(event, snapshot),
  // 装完更新后同样是"退出"：走同一条收尾流程，窗口位置与工作空间都要落盘。
  quit: () => quitApp(),
})

export function createHandlerContext(config: ConfigStore): HandlerContext {
  const backup = createBackupService({
    workspace: currentWorkspace,
    backupDir: () => config.backupDir(),
    autoBackupEnabled: () => config.get().autoBackup,
    supportedSchemaVersion: MIGRATIONS[MIGRATIONS.length - 1].version,
    closeWorkspace,
    restart: restartApp,
    now: () => new Date(),
    log: logWarn,
  })
  return { config, backup, updater }
}

export function asObject(request: unknown): Record<string, unknown> {
  return typeof request === 'object' && request !== null ? (request as Record<string, unknown>) : {}
}

/** QueryNumber 语义：数字/数字字符串 → 整数；空串或非数字 → null。 */
export function queryNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : null
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null
  }
  return null
}

export function workspaceDb(): Db {
  const workspace = currentWorkspace()
  if (!workspace) throw workspaceNotOpened()
  return workspace.db
}

/**
 * 恢复之后的「重启」。
 *
 * `TRANSACTIONS_TEST_RESTART=exit` 时只退出：E2E 自己再起一个进程，避免真的多开。
 */
function restartApp(): void {
  if (process.env.TRANSACTIONS_TEST_RESTART === 'exit') {
    quitApp()
    return
  }
  app.relaunch()
  quitApp()
}

/** 在资源管理器里打开一个目录；`shell.openPath` 用空串表示成功。 */
export async function openDirectoryInShell(directory: string): Promise<void> {
  const failure = await shell.openPath(directory)
  if (failure) throw new AppError(failure, { status: 500 })
}

export function createQuoteFetcher(): TencentStockQuoteFetcher {
  const testBase = process.env.TRANSACTIONS_TEST_QUOTE_SOURCE
  return new TencentStockQuoteFetcher({
    fetchImpl: (url, signal) => appFetch(url, { signal }),
    ...(testBase ? { baseUrl: testBase } : {}),
    // 夹具服务器没有 GBK 编码器：要测中文名称时由测试指定 UTF-8 回包。
    ...(process.env.TRANSACTIONS_TEST_QUOTE_CHARSET === 'utf-8'
      ? { charset: 'utf-8' as const }
      : {}),
  })
}

/** 涨停池数据源：地址与代理都走注入的 fetch（测试可用环境变量指到本地服务）。 */
export function createLimitPoolSource(): EastmoneyLimitPoolSource {
  const testBase = process.env.TRANSACTIONS_TEST_LIMIT_SOURCE
  return new EastmoneyLimitPoolSource({
    fetchImpl: (url, init) => appFetch(url, init),
    ...(testBase ? { baseUrl: testBase } : {}),
  })
}

/** 天梯的当前时间：测试环境可用 `TRANSACTIONS_TEST_LADDER_NOW` 钉住"盘中/收盘后"。 */
export function limitNowSeconds(): number {
  const raw = process.env.TRANSACTIONS_TEST_LADDER_NOW
  if (raw) {
    const parsed = Number(raw)
    if (Number.isFinite(parsed)) return Math.trunc(parsed)
  }
  return nowSeconds()
}
