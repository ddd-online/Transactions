/**
 * 设置 · 数据分栏的列表区：备份列表（恢复入口）与最近工作空间列表。
 *
 * 数据由 {@link SettingsData} 拉好传进来；点一行只把「选了哪条」交回去 ——
 * 恢复确认对话框、切换工作空间的落库与刷新都留在页面。
 */

import type { JSX } from 'react'

import { formatBytes } from '../../shared/domain/backup'
import { formatTimestamp } from '../../shared/domain/time'
import type { BackupEntryDto } from '../../shared/types/backup'
import { Button } from '../components/button'

/** 目录路径的最后一段；路径为空时回退原串。 */
export function baseName(path: string): string {
  const parts = path.split(/[\\/]/).filter((part) => part.length > 0)
  return parts[parts.length - 1] ?? path
}

/** 路径是不是同一个目录（渲染层不能 import `node:path`：去掉尾分隔符 + Windows 不分大小写）。 */
export function samePath(left: string, right: string): boolean {
  const normalize = (value: string): string => value.replace(/[\\/]+$/, '').toLowerCase()
  return normalize(left) === normalize(right)
}

export interface SettingsDataBackupListProps {
  /** 当前工作空间目录（未打开时为空串） */
  workspace: string
  backups: BackupEntryDto[]
  loading: boolean
  /** 有动作在跑：每一行都置灰 */
  busy: boolean
  /** 选中一行：页面据此打开恢复确认 */
  onSelect: (entry: BackupEntryDto) => void
}

export function SettingsDataBackupList({
  workspace,
  backups,
  loading,
  busy,
  onSelect,
}: SettingsDataBackupListProps): JSX.Element {
  return (
    <div className="st-backup-list" data-testid="backup-list">
      {!workspace ? (
        <p className="st-backup-empty">尚未打开工作空间；打开后这里会列出可恢复的备份。</p>
      ) : loading ? (
        <p className="st-backup-empty">正在读取备份…</p>
      ) : backups.length === 0 ? (
        <p className="st-backup-empty">
          <span className="st-backup-empty-title">还没有备份</span>
          <span>点「立即备份」生成第一份；也可以用「从文件恢复…」打开已有的 .db。</span>
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
              disabled={!entry.restorable || busy}
              title={entry.restorable ? entry.path : entry.problem}
              onClick={() => onSelect(entry)}
            >
              <span className="st-backup-main">
                <span className="st-backup-name">{entry.name}</span>
                {entry.kind === 'auto' ? <span className="st-backup-badge">自动</span> : null}
                {entry.kind === 'pre-restore' ? (
                  <span className="st-backup-badge">恢复前</span>
                ) : null}
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
                {/* 行是按钮，这一枚是它的动作名：没有它，行看起来只是三列元信息。 */}
                {entry.restorable ? <span className="st-backup-action">恢复</span> : null}
              </span>
            </button>
          )
        })
      )}
    </div>
  )
}

export interface SettingsDataRecentListProps {
  /** 当前工作空间目录：与它相同的那一行置灰 */
  workspace: string
  /** 最近打开过的目录，按配置里的顺序 */
  recent: string[]
  busy: boolean
  /** 目录框开着：「选择工作空间…」进入进行中态 */
  picking: boolean
  onPickWorkspace: () => void
  /** 点一条切换（当前那条不可点） */
  onOpen: (dir: string) => void
}

export function SettingsDataRecentList({
  workspace,
  recent,
  busy,
  picking,
  onPickWorkspace,
  onOpen,
}: SettingsDataRecentListProps): JSX.Element {
  return (
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
            disabled={busy}
            loading={picking}
            onClick={() => void onPickWorkspace()}
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
                disabled={current || busy}
                title={current ? '当前工作空间' : `切换到 ${dir}`}
                onClick={() => void onOpen(dir)}
              >
                <span className="st-recent-main">
                  <span className="st-recent-name">{baseName(dir)}</span>
                  <span className="st-recent-path">{dir}</span>
                </span>
                {current ? (
                  <span className="st-recent-badge">当前</span>
                ) : (
                  <span className="st-recent-action">切换</span>
                )}
              </button>
            )
          })
        )}
      </div>
    </div>
  )
}
