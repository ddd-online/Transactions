import { Switch as AntSwitch } from 'antd'
import { useCallback, useEffect, useState, type JSX } from 'react'

import { formatBytes } from '../../shared/domain/backup'
import { formatTimestamp } from '../../shared/domain/time'
import { errorMessage } from '../../shared/errors'
import type { BackupEntryDto, BackupResultDto } from '../../shared/types/backup'
import type { ConfigSnapshot } from '../../shared/types/config'
import { Button } from '../components/button'
import { ConfirmDialog } from '../components/confirm-dialog'
import { SettingsRow } from '../components/settings-row'
import { notify } from '../components/toast'

/**
 * 设置 · 数据分栏：备份、恢复、数据目录与最近工作空间。
 *
 * 这一页只做两件事：把主进程算好的结果画出来（名称 / 大小 / 耗时 / 库版本），
 * 以及把用户的动作原样交给命令目录。路径一律由主进程给、原样回传 ——
 * 渲染层不拼路径，也就不会出现「界面以为的备份位置」和「实际写盘的位置」两套。
 *
 * 所有动作的回执走 `notify`；`data-error` 只留给这一页确实失败的时刻
 * （列表读不出来、恢复被拒绝），它带 `role="alert"`，读屏也要听得到。
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

/** 目录路径的最后一段；路径为空时回退原串。 */
function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0)
  return parts[parts.length - 1] ?? path
}

/** 路径是不是同一个目录（渲染层不能 import `node:path`：去掉尾分隔符 + Windows 不分大小写）。 */
function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string => value.replace(/[\\/]+$/, '').toLowerCase()
  return normalize(left) === normalize(right)
}

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
  const [busy, setBusy] = useState('')
  const [backups, setBackups] = useState<BackupEntryDto[]>([])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<BackupResultDto | null>(null)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null)

  const reloadBackups = useCallback(async (): Promise<void> => {
    // 没有工作空间就没有「当前数据」，备份目录也不必去读：空态比一句报错更准确。
    if (!workspace) {
      setBackups([])
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setBackups(await window.api.invoke('backup_list'))
    } catch (listError) {
      setBackups([])
      setError(errorMessage(listError))
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

  const backupNow = useCallback(async (): Promise<void> => {
    if (!workspace) return
    setBusy('backup')
    setError('')
    setStatus('正在备份…')
    try {
      const created = await window.api.invoke('backup_create')
      setResult(created)
      setStatus('')
      notify(`已备份 ${created.name}`)
      await reloadBackups()
    } catch (backupError) {
      setStatus('')
      setError(errorMessage(backupError))
      notify(errorMessage(backupError), 'error')
    } finally {
      setBusy('')
    }
  }, [reloadBackups, workspace])

  const changeBackupDir = useCallback(async (): Promise<void> => {
    setBusy('dir')
    setError('')
    try {
      const picked = await window.api.invoke('dialog_open', { title: '选择备份位置' })
      if (picked.canceled || !picked.filePaths[0]) return
      const next = await window.api.invoke('backup_dir_set', { dir: picked.filePaths[0] })
      onConfigChanged(next)
      notify('备份位置已更新')
    } catch (dirError) {
      setError(errorMessage(dirError))
      notify(errorMessage(dirError), 'error')
    } finally {
      setBusy('')
    }
  }, [onConfigChanged])

  const openDirectory = useCallback(async (target: 'workspace' | 'backup'): Promise<void> => {
    setBusy(`open-${target}`)
    setError('')
    try {
      await window.api.invoke('workspace_open_dir', { target })
    } catch (openError) {
      setError(errorMessage(openError))
      notify(errorMessage(openError), 'error')
    } finally {
      setBusy('')
    }
  }, [])

  const setAutoBackup = useCallback(
    async (enabled: boolean): Promise<void> => {
      setBusy('auto')
      setError('')
      try {
        const next = await window.api.invoke('config_set_auto_backup', { enabled })
        onConfigChanged(next)
      } catch (autoError) {
        setError(errorMessage(autoError))
        notify(errorMessage(autoError), 'error')
      } finally {
        setBusy('')
      }
    },
    [onConfigChanged],
  )

  const pickRestoreFile = useCallback(async (): Promise<void> => {
    setBusy('pick')
    setError('')
    try {
      const picked = await window.api.invoke('dialog_open_file', {
        title: '选择要恢复的备份文件',
        extensions: ['db'],
      })
      if (picked.canceled || !picked.filePaths[0]) return
      const path = picked.filePaths[0]
      // 选中的是不是工作空间、版本高不高，由主进程在恢复时校验并给出那句原因。
      setRestoreTarget({ path, name: baseName(path), workspaceDir: '' })
    } catch (pickError) {
      setError(errorMessage(pickError))
      notify(errorMessage(pickError), 'error')
    } finally {
      setBusy('')
    }
  }, [])

  const confirmRestore = useCallback(async (): Promise<void> => {
    const target = restoreTarget
    setRestoreTarget(null)
    if (!target) return
    setBusy('restore')
    setError('')
    setStatus('正在恢复…')
    try {
      await window.api.invoke('backup_restore', { path: target.path })
      setStatus('已恢复，正在重启…')
      notify('已恢复，正在重启…')
    } catch (restoreError) {
      setStatus('')
      setError(errorMessage(restoreError))
      notify(errorMessage(restoreError), 'error')
    } finally {
      setBusy('')
    }
  }, [restoreTarget])

  const pickWorkspace = useCallback(async (): Promise<void> => {
    setBusy('pick-workspace')
    setError('')
    try {
      await onPickWorkspace()
      await refreshConfig()
    } catch (pickError) {
      setError(errorMessage(pickError))
      notify(errorMessage(pickError), 'error')
    } finally {
      setBusy('')
    }
  }, [onPickWorkspace, refreshConfig])

  const openRecent = useCallback(
    async (dir: string): Promise<void> => {
      if (dir === workspace) return
      setBusy('recent')
      setError('')
      try {
        await onOpenWorkspace(dir)
        // 最近工作空间是外壳写进去的：换完必须重拉一次，顺序与置灰项才对。
        await refreshConfig()
        notify(`已切换到 ${baseName(dir)}`)
      } catch (openError) {
        setError(errorMessage(openError))
        notify(errorMessage(openError), 'error')
      } finally {
        setBusy('')
      }
    },
    [onOpenWorkspace, refreshConfig, workspace],
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
      <div className="st-card">
        <div className="st-card-info">
          <span className="st-card-title">立即备份</span>
          <span className="st-card-desc">
            把当前工作空间的库与图片资产复制成一份带时间戳的目录，放在下面的备份位置
          </span>
        </div>
        <div className="st-card-action">
          <Button
            variant="secondary"
            testId="backup-now"
            disabled={!workspace || busyAny}
            loading={busy === 'backup'}
            onClick={() => void backupNow()}
          >
            立即备份
          </Button>
        </div>
      </div>
      {result ? (
        <p className="st-backup-result" data-testid="backup-result">
          已备份 <span className="st-backup-mono">{result.name}</span>（
          <span className="st-backup-mono">{formatBytes(result.sizeBytes)}</span>，用时{' '}
          <span className="st-backup-mono">{result.durationMs}</span>ms）
        </p>
      ) : null}

      <SettingsRow title="备份位置" description="手动备份与恢复前副本都落在这一目录；默认在「文档」下">
        <input
          className="st-backup-dir-input"
          data-testid="backup-dir"
          readOnly
          value={config?.backupDir ?? ''}
          placeholder="尚未读取到备份位置"
          title={config?.backupDir ?? ''}
        />
        <Button
          variant="secondary"
          testId="backup-dir-change"
          disabled={!config || busyAny}
          onClick={() => void changeBackupDir()}
        >
          更改
        </Button>
        <Button
          variant="secondary"
          testId="backup-open-dir"
          disabled={busyAny}
          onClick={() => void openDirectory('backup')}
        >
          打开
        </Button>
      </SettingsRow>

      <SettingsRow title="工作空间目录" description="当前账本的库与图片所在的位置">
        <Button
          variant="secondary"
          testId="workspace-open-dir"
          disabled={!workspace || busyAny}
          onClick={() => void openDirectory('workspace')}
        >
          打开
        </Button>
      </SettingsRow>

      <SettingsRow
        title="自动备份"
        description="每天第一次打开工作空间时另存一份只含库的当日快照，保留最近 7 份"
      >
        <AntSwitch
          checked={config?.autoBackup ?? true}
          disabled={!config || busyAny}
          data-testid="auto-backup"
          aria-label="自动备份"
          onChange={(next) => void setAutoBackup(next)}
        />
      </SettingsRow>

      <div className="st-card st-card--block">
        <div className="st-panel-head">
          <div className="st-card-info">
            <span className="st-card-title">从备份恢复</span>
            <span className="st-card-desc">
              选中一份备份覆盖当前数据；恢复前会先把当前库另存为 pre-restore 副本，完成后应用自动重启
            </span>
          </div>
          <div className="st-panel-actions">
            <Button
              variant="secondary"
              testId="backup-restore-pick"
              disabled={!workspace || busyAny}
              onClick={() => void pickRestoreFile()}
            >
              从文件恢复…
            </Button>
          </div>
        </div>
        <div className="st-backup-list" data-testid="backup-list">
          {!workspace ? (
            <p className="st-backup-empty">尚未打开工作空间；打开后这里会列出可恢复的备份。</p>
          ) : loading ? (
            <p className="st-backup-empty">正在读取备份…</p>
          ) : backups.length === 0 ? (
            <p className="st-backup-empty">
              暂无备份。点「立即备份」生成第一份，也可以用「从文件恢复…」打开已有的 .db。
            </p>
          ) : (
            backups.map((entry) => {
              const foreign =
                entry.workspaceDir.trim() !== '' && !samePath(entry.workspaceDir, workspace)
              return (
                <button
                  key={entry.path}
                  type="button"
                  className={`st-backup-row${entry.restorable ? '' : ' is-disabled'}`}
                  data-testid="backup-row"
                  disabled={!entry.restorable || busyAny}
                  title={entry.restorable ? entry.path : entry.problem}
                  onClick={() =>
                    setRestoreTarget({
                      path: entry.path,
                      name: entry.name,
                      workspaceDir: entry.workspaceDir,
                    })
                  }
                >
                  <span className="st-backup-main">
                    <span className="st-backup-name">{entry.name}</span>
                    {foreign ? (
                      <span className="st-backup-badge" title={entry.workspaceDir}>
                        其他工作空间 {entry.workspaceDir}
                      </span>
                    ) : null}
                    {entry.hasAssets ? <span className="st-backup-badge">含图片</span> : null}
                    {entry.restorable ? null : (
                      <span className="st-backup-problem">{entry.problem}</span>
                    )}
                  </span>
                  <span className="st-backup-meta">
                    <span className="st-backup-mono">
                      {formatTimestamp(entry.createdAt, 'YYYY-MM-DD HH:mm:ss')}
                    </span>
                    <span className="st-backup-mono">{formatBytes(entry.sizeBytes)}</span>
                    <span className="st-backup-mono">库版本 v{entry.schemaVersion}</span>
                  </span>
                </button>
              )
            })
          )}
        </div>
      </div>

      <div className="st-card st-card--block">
        <div className="st-panel-head">
          <div className="st-card-info">
            <span className="st-card-title">最近工作空间</span>
            <span className="st-card-desc">
              最近打开过的 5 个位置；点一条切换，当前这条置灰，不可再点
            </span>
          </div>
          <div className="st-panel-actions">
            <Button
              variant="secondary"
              disabled={busyAny}
              loading={busy === 'pick-workspace'}
              onClick={() => void pickWorkspace()}
            >
              选择工作空间…
            </Button>
          </div>
        </div>
        <div className="st-recent-list" data-testid="recent-workspace-list">
          {recent.length === 0 ? (
            <p className="st-recent-empty">还没有最近打开的工作空间。</p>
          ) : (
            recent.map((dir) => {
              const current = dir === workspace
              return (
                <button
                  key={dir}
                  type="button"
                  className={`st-recent-row${current ? ' is-current' : ''}`}
                  data-testid="recent-workspace-row"
                  data-current={current ? 'true' : undefined}
                  disabled={current || busyAny}
                  title={current ? '当前工作空间' : `切换到 ${dir}`}
                  onClick={() => void openRecent(dir)}
                >
                  <span className="st-recent-main">
                    <span className="st-recent-name">{baseName(dir)}</span>
                    <span className="st-recent-path">{dir}</span>
                  </span>
                  {current ? <span className="st-recent-badge">当前</span> : null}
                </button>
              )
            })
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="m0-error" data-testid="data-error">
          {error}
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
