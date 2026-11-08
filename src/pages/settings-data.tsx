import { useCallback, useEffect, useState, type JSX } from 'react'

import { errorMessage } from '../../shared/errors'
import type { BackupEntryDto, BackupResultDto } from '../../shared/types/backup'
import type { ConfigSnapshot } from '../../shared/types/config'
import { ConfirmDialog } from '../components/confirm-dialog'
import { notify } from '../components/toast'
import { SettingsDataBackup } from './settings-data-backup'
import {
  SettingsDataBackupList,
  SettingsDataRecentList,
  baseName,
  samePath,
} from './settings-data-list'

/**
 * 设置 · 数据分栏：备份、恢复、数据目录与最近工作空间。
 *
 * 这一页只做两件事：把主进程算好的结果画出来（名称 / 大小 / 耗时 / 库版本），
 * 以及把用户的动作原样交给命令目录。路径一律由主进程给、原样回传 ——
 * 渲染层不拼路径，也就不会出现「界面以为的备份位置」和「实际写盘的位置」两套。
 *
 * 所有动作的回执走 `notify`（成功失败都是）；`data-error` 只留给「这一页装不起来」
 * （`backup_list` 读不出来的那一刻），它带 `role="alert"`，读屏也要听得到。
 */

export interface SettingsDataProps {
  /** 当前工作空间目录（未打开时为空串） */
  workspace: string
  config: ConfigSnapshot | null
  /** 换一个工作空间（目录框）：外壳负责落库与刷新 */
  onPickWorkspace: () => Promise<void>
  /** 直接开某个目录（最近工作空间）：外壳负责落库与刷新 */
  onOpenWorkspace: (dir: string) => Promise<void>
  onConfigChanged: (config: ConfigSnapshot) => void
}

/** 正在进行的动作；空串 = 空闲。`open-*` 各占一项，不再拼字符串。 */
type Action =
  | 'backup'
  | 'dir'
  | 'auto'
  | 'pick'
  | 'restore'
  | 'pick-workspace'
  | 'recent'
  | 'open-workspace'
  | 'open-backup'

/** 正在恢复的候选：列表里的一行，或文件框选中的任意 .db。 */
interface RestoreTarget {
  path: string
  name: string
  /** 来源工作空间（列表里的那一行带出来；文件框选中的读不到，为空串） */
  workspaceDir: string
}

export function SettingsData({
  workspace,
  config,
  onPickWorkspace,
  onOpenWorkspace,
  onConfigChanged,
}: SettingsDataProps): JSX.Element {
  /** 正在进行的动作；空串 = 空闲。任何动作进行中都禁止重复点击。 */
  const [busy, setBusy] = useState<Action | ''>('')
  const [backups, setBackups] = useState<BackupEntryDto[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BackupResultDto | null>(null)
  const [status, setStatus] = useState('')
  /** 只放「这一页装不起来」：动作失败一律走 notify，不在页面上再报一遍。 */
  const [loadError, setLoadError] = useState('')
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null)

  const reloadBackups = useCallback(async (): Promise<void> => {
    // 没有工作空间就没有「当前数据」，备份目录也不必去读：空态比一句报错更准确。
    if (!workspace) {
      setBackups([])
      setLoadError('')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setBackups(await window.api.invoke('backup_list'))
      setLoadError('')
    } catch (listError) {
      setBackups([])
      setLoadError(errorMessage(listError))
    } finally {
      setLoading(false)
    }
  }, [workspace])

  useEffect(() => {
    void reloadBackups()
  }, [reloadBackups])

  const refreshConfig = useCallback(async (): Promise<void> => {
    onConfigChanged(await window.api.invoke('config_get'))
  }, [onConfigChanged])

  /**
   * 所有动作走同一段 try/catch/finally：失败只 `notify`。
   *
   * DESIGN 的规矩是「动作的回执走消息，页面的装载失败留在页面上」—— 动作失败再往
   * `data-error` 上写一遍，用户会在两处看到同一句话。
   */
  const runAction = useCallback(
    async (action: Action, work: () => Promise<void>): Promise<void> => {
      setBusy(action)
      try {
        await work()
      } catch (actionError) {
        setStatus('')
        notify(errorMessage(actionError), 'error')
      } finally {
        setBusy('')
      }
    },
    [],
  )

  const backupNow = useCallback((): Promise<void> => {
    if (!workspace) return Promise.resolve()
    return runAction('backup', async () => {
      setStatus('正在备份…')
      const created = await window.api.invoke('backup_create')
      setResult(created)
      setStatus('')
      notify(`已备份 ${created.name}`)
      await reloadBackups()
    })
  }, [reloadBackups, runAction, workspace])

  const changeBackupDir = useCallback(
    (): Promise<void> =>
      runAction('dir', async () => {
        const picked = await window.api.invoke('dialog_open', { title: '选择备份位置' })
        if (picked.canceled || !picked.filePaths[0]) return
        const next = await window.api.invoke('backup_dir_set', { dir: picked.filePaths[0] })
        onConfigChanged(next)
        notify('备份位置已更新')
      }),
    [onConfigChanged, runAction],
  )

  const openDirectory = useCallback(
    (target: 'workspace' | 'backup'): Promise<void> =>
      runAction(target === 'workspace' ? 'open-workspace' : 'open-backup', async () => {
        await window.api.invoke('workspace_open_dir', { target })
      }),
    [runAction],
  )

  const setAutoBackup = useCallback(
    (enabled: boolean): Promise<void> =>
      runAction('auto', async () => {
        const next = await window.api.invoke('config_set_auto_backup', { enabled })
        onConfigChanged(next)
      }),
    [onConfigChanged, runAction],
  )

  const pickRestoreFile = useCallback(
    (): Promise<void> =>
      runAction('pick', async () => {
        const picked = await window.api.invoke('dialog_open_file', {
          title: '选择要恢复的备份文件',
          extensions: ['db'],
        })
        if (picked.canceled || !picked.filePaths[0]) return
        const path = picked.filePaths[0]
        // 选中的是不是工作空间、版本高不高，由主进程在恢复时校验并给出那句原因。
        setRestoreTarget({ path, name: baseName(path), workspaceDir: '' })
      }),
    [runAction],
  )

  const confirmRestore = useCallback((): Promise<void> => {
    const target = restoreTarget
    setRestoreTarget(null)
    if (!target) return Promise.resolve()
    return runAction('restore', async () => {
      setStatus('正在恢复…')
      await window.api.invoke('backup_restore', { path: target.path })
      // 进行中状态，不是错误：保留在 data-status 上（重启前用户要看到它在动）
      setStatus('已恢复，正在重启…')
      notify('已恢复，正在重启…')
    })
  }, [restoreTarget, runAction])

  const pickWorkspace = useCallback(
    (): Promise<void> =>
      runAction('pick-workspace', async () => {
        await onPickWorkspace()
        await refreshConfig()
      }),
    [onPickWorkspace, refreshConfig, runAction],
  )

  const openRecent = useCallback(
    (dir: string): Promise<void> => {
      if (dir === workspace) return Promise.resolve()
      return runAction('recent', async () => {
        await onOpenWorkspace(dir)
        // 最近工作空间是外壳写进去的：换完必须重拉一次，顺序与置灰项才对。
        await refreshConfig()
        notify(`已切换到 ${baseName(dir)}`)
      })
    },
    [onOpenWorkspace, refreshConfig, runAction, workspace],
  )

  const busyAny = busy !== ''
  const recent = config?.recentWorkspaces ?? []
  const foreignTarget =
    restoreTarget !== null &&
    restoreTarget.workspaceDir.trim() !== '' &&
    !samePath(restoreTarget.workspaceDir, workspace)
  const restoreMessage = `${
    foreignTarget ? `这份备份来自另一个工作空间（${restoreTarget.workspaceDir}）。` : ''
  }将用 ${restoreTarget?.name ?? ''} 覆盖当前数据。当前的库会先另存为 pre-restore 副本，然后应用会自动重启。`

  return (
    <div className="st-list">
      <SettingsDataBackup
        workspace={workspace}
        config={config}
        result={result}
        busy={busyAny}
        backingUp={busy === 'backup'}
        onBackupNow={backupNow}
        onChangeBackupDir={changeBackupDir}
        onOpenDirectory={openDirectory}
        onAutoBackupChange={setAutoBackup}
        onPickRestoreFile={pickRestoreFile}
      >
        <SettingsDataBackupList
          workspace={workspace}
          backups={backups}
          loading={loading}
          busy={busyAny}
          onSelect={(entry) =>
            setRestoreTarget({
              path: entry.path,
              name: entry.name,
              workspaceDir: entry.workspaceDir,
            })
          }
        />
      </SettingsDataBackup>

      <SettingsDataRecentList
        workspace={workspace}
        recent={recent}
        busy={busyAny}
        picking={busy === 'pick-workspace'}
        onPickWorkspace={pickWorkspace}
        onOpen={openRecent}
      />

      {loadError ? (
        <p role="alert" className="m0-error" data-testid="data-error">
          {loadError}
        </p>
      ) : null}
      {status ? (
        <p className="m0-muted" data-testid="data-status">
          {status}
        </p>
      ) : null}

      <ConfirmDialog
        open={restoreTarget !== null}
        title="从备份恢复"
        message={restoreMessage}
        confirmText="恢复"
        danger
        onCancel={() => setRestoreTarget(null)}
        onConfirm={() => void confirmRestore()}
      />
    </div>
  )
}
