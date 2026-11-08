/**
 * 设置 · 数据分栏的备份动作区：立即备份、备份位置、数据目录、自动备份开关与恢复入口。
 *
 * 所有动作（含 `busy` 与 `runAction`）都在 {@link SettingsData}；这里只接当前值、
 * 进行中状态与回调。恢复卡片里的备份列表由列表模块渲染，经 `children` 放进来，
 * 保持原来的卡片结构不变。
 */

import { Switch as AntSwitch } from 'antd'
import type { JSX, ReactNode } from 'react'

import { formatBytes } from '../../shared/domain/backup'
import type { BackupResultDto } from '../../shared/types/backup'
import type { ConfigSnapshot } from '../../shared/types/config'
import { Button } from '../components/button'
import { SettingsRow } from '../components/settings-row'

export interface SettingsDataBackupProps {
  /** 当前工作空间目录（未打开时为空串） */
  workspace: string
  config: ConfigSnapshot | null
  /** 最近一次「立即备份」的结果；有就显示那一行回执 */
  result: BackupResultDto | null
  /** 有动作在跑：所有入口置灰 */
  busy: boolean
  /** 正在立即备份：那枚按钮进入进行中态 */
  backingUp: boolean
  onBackupNow: () => void
  onChangeBackupDir: () => void
  /** 打开数据目录，`workspace` 是当前库所在目录、`backup` 是备份位置 */
  onOpenDirectory: (target: 'workspace' | 'backup') => void
  onAutoBackupChange: (enabled: boolean) => void
  onPickRestoreFile: () => void
  /** 备份列表（恢复入口）：由列表模块渲染 */
  children?: ReactNode
}

export function SettingsDataBackup({
  workspace,
  config,
  result,
  busy,
  backingUp,
  onBackupNow,
  onChangeBackupDir,
  onOpenDirectory,
  onAutoBackupChange,
  onPickRestoreFile,
  children,
}: SettingsDataBackupProps): JSX.Element {
  return (
    <>
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
            disabled={!workspace || busy}
            loading={backingUp}
            onClick={() => void onBackupNow()}
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
          disabled={!config || busy}
          onClick={() => void onChangeBackupDir()}
        >
          更改
        </Button>
        <Button
          variant="secondary"
          testId="backup-open-dir"
          disabled={busy}
          onClick={() => void onOpenDirectory('backup')}
        >
          打开
        </Button>
      </SettingsRow>

      <SettingsRow title="工作空间目录" description="当前账本的库与图片所在的位置">
        <Button
          variant="secondary"
          testId="workspace-open-dir"
          disabled={!workspace || busy}
          onClick={() => void onOpenDirectory('workspace')}
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
          disabled={!config || busy}
          data-testid="auto-backup"
          aria-label="自动备份"
          onChange={(next) => void onAutoBackupChange(next)}
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
              disabled={!workspace || busy}
              onClick={() => void onPickRestoreFile()}
            >
              从文件恢复…
            </Button>
          </div>
        </div>
        {children}
      </div>
    </>
  )
}
