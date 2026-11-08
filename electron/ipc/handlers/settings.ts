/**
 * 设置类命令：配置读写、代理、备份 / 恢复与自动备份开关。
 *
 * 备份的纯逻辑在 shared/domain/backup，磁盘动作在 services/backup；这里只做命令层的
 * 参数解析与配置写入。
 */
import { mkdirSync } from 'node:fs'

import { session } from 'electron'

import { CLOSE_BEHAVIORS, type CloseBehavior } from '../../../shared/domain/consts'
import { resolveBackupDir } from '../../../shared/domain/backup'
import { pickEnvProxy, validatedProxySetting } from '../../../shared/domain/proxy'
import { AppError } from '../../../shared/errors'
import type { FeatureFlags, ProxySetting } from '../../../shared/types/config'
import { currentWorkspace } from '../../db'
import { logWarn } from '../../logging'
import { backupDirProblem } from '../../services/backup'
import { setFeatureIn } from '../../services/config'
import { applyAppearance } from '../../shell/window'
import { applyProxy, appFetch } from '../../shell/net'
import type { HandlerMap } from '../commands'
import { asObject, type HandlerContext } from './context'

export function createSettingsHandlers(
  ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'config_get'
  | 'config_file_path'
  | 'config_set_close_behavior'
  | 'config_set_appearance'
  | 'config_set_feature'
  | 'config_set_key_event_linked_open'
  | 'config_set_sidebar_collapsed'
  | 'config_set_chart_summary_collapsed'
  | 'config_set_proxy'
  | 'proxy_resolve'
  | 'proxy_test'
  | 'backup_create'
  | 'backup_list'
  | 'backup_restore'
  | 'backup_dir_set'
  | 'config_set_auto_backup'
> {
  return {
    config_get() {
      return ctx.config.snapshot()
    },

    config_file_path() {
      return ctx.config.path
    },

    config_set_close_behavior(request) {
      const behavior = String(asObject(request).behavior ?? '')
      if (!CLOSE_BEHAVIORS.includes(behavior as CloseBehavior)) {
        throw new AppError('无效的关闭行为', { status: 400 })
      }
      ctx.config.update((config) => {
        config.closeBehavior = behavior
      })
      return null
    },

    config_set_appearance(request) {
      const appearance = String(asObject(request).appearance ?? '')
      if (appearance !== 'light' && appearance !== 'dark' && appearance !== 'system') {
        throw new AppError('无效的外观设置', { status: 400 })
      }
      ctx.config.update((config) => {
        config.appearance = appearance
      })
      applyAppearance(appearance)
      return null
    },

    config_set_feature(request) {
      const raw = asObject(request)
      const feature = String(raw.feature ?? '')
      const enabled = raw.enabled === true
      const ledgerId = typeof raw.ledgerId === 'string' ? raw.ledgerId : ''
      return ctx.config.update((config) =>
        setFeatureIn(config, ledgerId, feature, enabled),
      ) as FeatureFlags
    },

    config_set_key_event_linked_open(request) {
      const open = asObject(request).open === true
      return ctx.config.update((config) => {
        config.keyEventLinkedOpen = open
        return config.keyEventLinkedOpen
      })
    },

    config_set_sidebar_collapsed(request) {
      const collapsed = asObject(request).collapsed === true
      return ctx.config.update((config) => {
        config.sidebarCollapsed = collapsed
        return config.sidebarCollapsed
      })
    },

    config_set_chart_summary_collapsed(request) {
      const collapsed = asObject(request).collapsed === true
      return ctx.config.update((config) => {
        config.chartSummaryCollapsed = collapsed
        return config.chartSummaryCollapsed
      })
    },

    config_set_proxy(request) {
      const raw = asObject(request)
      const setting = validatedProxySetting(
        String(raw.mode ?? ''),
        String(raw.url ?? ''),
      ) as ProxySetting
      ctx.config.update((config) => {
        config.proxy = setting
      })
      void applyProxy(setting)
      return setting
    },

    async proxy_resolve(request) {
      const raw = asObject(request)
      const setting = validatedProxySetting(
        String(raw.mode ?? ''),
        String(raw.url ?? ''),
      ) as ProxySetting
      const testAddress = process.env.TRANSACTIONS_TEST_PROXY_ADDRESS
      if (testAddress) return { url: testAddress }
      const saved = ctx.config.snapshot().proxy
      let resolved = ''
      try {
        await applyProxy(setting)
        try {
          resolved = await session.defaultSession.resolveProxy('https://api.github.com')
        } catch (error) {
          logWarn(`解析代理地址失败: ${error instanceof Error ? error.message : String(error)}`)
        }
      } finally {
        await applyProxy(saved)
      }
      if (!resolved) {
        // 系统解析不可用时，至少把环境变量里的代理显示出来，别让界面停在“未探测到”
        resolved = pickEnvProxy((key) => process.env[key] ?? null) ?? ''
      }
      if (!resolved) return { url: '直连' }
      const first = resolved.split(';')[0]?.trim() ?? ''
      const url = first.startsWith('PROXY ')
        ? first.slice('PROXY '.length)
        : first === 'DIRECT'
          ? '直连'
          : first
      return { url }
    },

    async proxy_test(request) {
      const raw = asObject(request)
      const setting = validatedProxySetting(
        String(raw.mode ?? ''),
        String(raw.url ?? ''),
      ) as ProxySetting
      const saved = ctx.config.snapshot().proxy
      const target =
        process.env.TRANSACTIONS_TEST_PROXY_TARGET ?? 'https://api.github.com/zen'
      const started = Date.now()
      let status: number | null = null
      let ok = false
      let message = ''
      try {
        await applyProxy(setting)
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), 8000)
        try {
          const response = await appFetch(target, {
            method: 'GET',
            cache: 'no-store',
            signal: controller.signal,
            headers: { 'User-Agent': 'Transactions-proxy-test' },
          })
          status = response.status
          ok = status < 500
          message = ok
            ? `代理连通正常（${Date.now() - started} ms）`
            : `代理已连接，但目标返回 HTTP ${status}`
        } finally {
          clearTimeout(timer)
        }
      } catch (error) {
        message = `代理连接失败：${error instanceof Error ? error.message : String(error)}`
      } finally {
        await applyProxy(saved)
      }
      return {
        ok,
        status,
        latencyMs: Date.now() - started,
        url: setting.url,
        message,
      }
    },

    backup_create() {
      return ctx.backup.createManual()
    },

    backup_list() {
      return ctx.backup.list()
    },

    backup_restore(request) {
      return ctx.backup.restore(String(asObject(request).path ?? ''))
    },

    backup_dir_set(request) {
      const requested = String(asObject(request).dir ?? '').trim()
      const resolved = resolveBackupDir(requested, ctx.config.documentsDir)
      const workspace = currentWorkspace()
      if (workspace) {
        // 不合格时既不写配置也不建目录：设置里能存下的位置，备份时就必须能写
        const problem = backupDirProblem(resolved, workspace.directory)
        if (problem) throw new AppError(problem, { status: 400 })
      }
      // 先建目录再写配置：目录建不出来时配置不能已经指向一个用不了的位置
      mkdirSync(resolved, { recursive: true })
      ctx.config.update((config) => {
        config.backupDir = requested
      })
      return ctx.config.snapshot()
    },

    config_set_auto_backup(request) {
      const enabled = asObject(request).enabled === true
      ctx.config.update((config) => {
        config.autoBackup = enabled
      })
      return ctx.config.snapshot()
    },
  }
}
