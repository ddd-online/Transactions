/**
 * 备份 / 恢复的共享形状（主进程与渲染层共用的信封）。
 *
 * 字段名与文案由共享契约钉死：IPC 只传这些，界面只读这些。
 * `path` 是绝对路径，恢复时原样回传给 `backup_restore` —— 界面不拼路径。
 */

/** 备份形态：手动（目录）/ 自动（单文件）/ 恢复前另存（单文件）。 */
export type BackupKind = 'manual' | 'auto' | 'pre-restore'

/** 一份快照的校验结论：可恢复 / 版本更高 / 不是工作空间 / 已损坏。 */
export type SnapshotStatus = 'ok' | 'newer' | 'not-workspace' | 'corrupt'

/** 备份列表里的一行；`restorable` 与 `status` 来自同一份校验结论。 */
export interface BackupEntryDto {
  /** 目录（手动备份）或文件（auto / pre-restore）的绝对路径；恢复时原样回传 */
  path: string
  /** 显示名 */
  name: string
  kind: BackupKind
  /** Unix 秒，取自名字；名字读不出时间时退回文件修改时间 */
  createdAt: number
  /** 目录为内部文件合计 */
  sizeBytes: number
  /** 读不出来 0 */
  schemaVersion: number
  /** 手动备份且带了 data/assets */
  hasAssets: boolean
  /** status === 'ok' */
  restorable: boolean
  status: SnapshotStatus
  /** status 不是 ok 时的一句话（= snapshotProblem），ok 为空串 */
  problem: string
}

/** 一次手动备份的结果：界面据此显示「已备份 <name>（<size>，用时 <ms>ms）」。 */
export interface BackupResultDto {
  name: string
  path: string
  sizeBytes: number
  durationMs: number
  createdAt: number
}

/** 一次恢复的结果：恢复前另存了哪一份、恢复的是哪一份。 */
export interface RestoreResultDto {
  /** 恢复前另存的当前数据 */
  preRestorePath: string
  /** 恢复的是哪一份（= 请求里的 path） */
  restoredFrom: string
}
