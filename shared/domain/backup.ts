/**
 * 备份这件事里**不碰文件系统**的那一半：文件名、保留裁剪、快照校验结论、最近工作空间。
 *
 * 这里全是纯函数：给定名字 / 名字列表 / 探针结果就能算出答案，不 import electron、
 * 不 import `node:fs`，所以渲染层也能直接 import（备份列表要用的就是这里的判定与文案）。
 * 真正的取快照、复制、删文件、重启由主进程的服务负责，它只消费这里导出的名字。
 *
 * 时间口径与 `./time` 一致：`YYYYMMDD-HHmmss` 取**宿主本地时区**，跨年由测试盯着。
 * `uniqueName` 的「这个名字已经存在」由调用方以函数注入 —— 判断存在要碰盘，
 * 而碰盘不是本模块的事。
 */

import type { BackupKind } from '../types/backup'
import { formatTimestamp } from './time'

/** 备份位置的默认目录名（「文档」下）。 */
export const BACKUP_DIR_NAME = 'Transactions 备份'
/** 手动备份的目录名前缀。 */
export const MANUAL_BACKUP_PREFIX = 'Transactions-备份-'
/** 自动备份的文件名前缀。 */
export const AUTO_BACKUP_PREFIX = 'auto-'
/** 恢复前另存的文件名前缀。 */
export const PRE_RESTORE_PREFIX = 'pre-restore-'
/** 自动备份保留的份数（只数 `auto-YYYYMMDD.db`）。 */
export const AUTO_BACKUP_KEEP = 7
/** 最近工作空间保留的条数。 */
export const RECENT_WORKSPACE_LIMIT = 5

const AUTO_NAME_PATTERN = /^auto-(\d{4})(\d{2})(\d{2})\.db$/
const STAMP_PATTERN = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/
/**
 * `uniqueName` 为同名同秒的第二份加的 `-2` / `-3` 后缀：
 * `auto-20260105-2.db`、`pre-restore-20260105-030405-2.db`、`Transactions-备份-20260105-030405-2`。
 */
const NAME_SUFFIX_PATTERN = /^(.*)-(\d+)(\.db)?$/
const DB_EXTENSION = '.db'
const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const
const BYTES_PER_UNIT = 1024

/** 一份快照的探针结果：主进程只读打开候选文件后读到的几件事。 */
export interface SnapshotProbe {
  /** 能否以只读方式打开 */
  opened: boolean
  /** 有 app_meta 表 */
  hasAppMeta: boolean
  /** app_meta.schema_version；读不到为 0 */
  schemaVersion: number
  /** app_meta.workspace_dir（产出它的工作空间）；读不到为 '' */
  workspaceDir: string
  /** 'ok' 或错误原文 */
  quickCheck: string
}

/** 校验结论：四个分支（判定顺序见 {@link judgeSnapshot}）。 */
export type SnapshotVerdict =
  | { status: 'ok'; schemaVersion: number }
  | { status: 'newer'; schemaVersion: number; supported: number }
  | { status: 'not-workspace' }
  | { status: 'corrupt'; reason: string }

// ---------------------------------------------------------------- 路径

/**
 * 拼一层目录（不用 `node:path`：本模块要能被渲染层打包）。
 *
 * 分隔符跟输入走：Windows 路径里有 `\` 就继续用 `\`，否则用 `/`。
 */
function joinPath(directory: string, name: string): string {
  const trimmed = directory.replace(/[\\/]+$/, '')
  if (trimmed.length === 0) {
    // 根路径（`/` / `\`）剥完只剩空串：分隔符要补回去，否则会拼出一个相对名字
    if (directory.length === 0) return name
    return `${directory[0] === '\\' ? '\\' : '/'}${name}`
  }
  // 分隔符跟原始输入走：`D:\` 剥完只剩 `D:`，不能因此判定成用 `/`
  const separator = directory.includes('\\') ? '\\' : '/'
  return `${trimmed}${separator}${name}`
}

/** 「文档」下的默认备份目录。 */
export function defaultBackupDir(documentsDir: string): string {
  return joinPath(documentsDir, BACKUP_DIR_NAME)
}

/** 配置里的备份位置：trim 后为空就回落到默认目录，否则原样用（相对路径也照用）。 */
export function resolveBackupDir(raw: string, documentsDir: string): string {
  const trimmed = raw.trim()
  return trimmed.length === 0 ? defaultBackupDir(documentsDir) : trimmed
}

// ---------------------------------------------------------------- 文件名

/** 本地时间 → `YYYYMMDD-HHmmss`（补零，与 `formatTimestamp` 同一口径）。 */
function localStamp(when: Date): string {
  return formatTimestamp(Math.trunc(when.getTime() / 1000), 'YYYYMMDD-HHmmss')
}

/** 手动备份的目录名：`Transactions-备份-YYYYMMDD-HHmmss`。 */
export function manualBackupName(when: Date): string {
  return `${MANUAL_BACKUP_PREFIX}${localStamp(when)}`
}

/** 自动备份的文件名：日期串 `YYYY-MM-DD` → `auto-YYYYMMDD.db`。 */
export function autoBackupName(ymd: string): string {
  return `${AUTO_BACKUP_PREFIX}${ymd.trim().replace(/-/g, '')}${DB_EXTENSION}`
}

/** 恢复前另存的文件名：`pre-restore-YYYYMMDD-HHmmss.db`。 */
export function preRestoreName(when: Date): string {
  return `${PRE_RESTORE_PREFIX}${localStamp(when)}${DB_EXTENSION}`
}

/**
 * 重名时在扩展名前加 `-2` / `-3` …；目录名没有扩展名时加在末尾。
 *
 * 同一秒里连做两次（手动备份与 pre-restore 各一次）就会撞名，而 `VACUUM INTO`
 * 的目标必须不存在，所以这一步不能省。
 */
export function uniqueName(name: string, exists: (candidate: string) => boolean): string {
  if (!exists(name)) return name
  const dot = name.lastIndexOf('.')
  const hasExtension = dot > 0 && dot < name.length - 1
  const stem = hasExtension ? name.slice(0, dot) : name
  const extension = hasExtension ? name.slice(dot) : ''
  for (let index = 2; index < 10_000; index += 1) {
    const candidate = `${stem}-${index}${extension}`
    if (!exists(candidate)) return candidate
  }
  throw new Error(`无法为 ${name} 找到可用的名字`)
}

// ---------------------------------------------------------------- 名字识别

/** `YYYYMMDD-HHmmss` → 本地时区 Unix 秒；月 / 日 / 时分秒越界返回 null。 */
function localStampSeconds(text: string): number | null {
  const match = STAMP_PATTERN.exec(text)
  if (!match) return null
  const [year, month, day, hour, minute, second] = match.slice(1).map(Number)
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  if (hour > 23 || minute > 59 || second > 59) return null
  return Math.trunc(new Date(year, month - 1, day, hour, minute, second).getTime() / 1000)
}

/** 手动备份名 → 名字里的本地时间；不是手动备份名返回 null。 */
function manualNameSeconds(name: string): number | null {
  if (!name.startsWith(MANUAL_BACKUP_PREFIX)) return null
  return localStampSeconds(name.slice(MANUAL_BACKUP_PREFIX.length))
}

/** 恢复前副本名 → 名字里的本地时间；不是这个名字返回 null。 */
function preRestoreSeconds(name: string): number | null {
  if (!name.startsWith(PRE_RESTORE_PREFIX)) return null
  if (!name.endsWith(DB_EXTENSION)) return null
  return localStampSeconds(name.slice(PRE_RESTORE_PREFIX.length, -DB_EXTENSION.length))
}

/** 自动备份名 → 当天本地 00:00:00 的 Unix 秒；不是这个名字返回 null。 */
function autoNameSeconds(name: string): number | null {
  const match = AUTO_NAME_PATTERN.exec(name)
  if (!match) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return Math.trunc(new Date(year, month - 1, day).getTime() / 1000)
}

/** 按名字认备份种类；名字认不出（不规则 / 不是备份）返回 null。 */
export function backupKindOf(name: string): BackupKind | null {
  return parseBackupName(name)?.kind ?? null
}

/** 严格形状解析（不带 `-<n>` 后缀）：三选一，认不出返回 null。 */
function strictParseBackupName(
  name: string,
): { kind: BackupKind; timestamp: number } | null {
  const manual = manualNameSeconds(name)
  if (manual !== null) return { kind: 'manual', timestamp: manual }
  const auto = autoNameSeconds(name)
  if (auto !== null) return { kind: 'auto', timestamp: auto }
  const preRestore = preRestoreSeconds(name)
  if (preRestore !== null) return { kind: 'pre-restore', timestamp: preRestore }
  return null
}

/**
 * 剥掉一次 `-<n>` 后缀；没剥掉返回原串。
 *
 * 先按严格形状解析再走这里：`auto-20260105.db` 本身就是合法名字，不能被当成
 * 「`auto` + 后缀 `20260105`」剥成 `auto.db`。
 */
function withoutNameSuffix(name: string): string {
  const match = NAME_SUFFIX_PATTERN.exec(name)
  if (!match) return name
  return `${match[1]}${match[3] ?? ''}`
}

/** 按名字读出种类与时间；名字认不出返回 null。 */
export function parseBackupName(name: string): { kind: BackupKind; timestamp: number } | null {
  const direct = strictParseBackupName(name)
  if (direct) return direct
  const stripped = withoutNameSuffix(name)
  if (stripped === name) return null
  return strictParseBackupName(stripped)
}

/** 一份 auto 快照：时间来自名字里的日期；`rank` 是同一天多份时的先后（base = 0）。 */
interface AutoEntry {
  name: string
  timestamp: number
  rank: number
}

/** 认一份 auto 快照；同一天的第二份带 `-2` 后缀，rank 记下它比 base 新。 */
function autoEntryOf(name: string): AutoEntry | null {
  const direct = autoNameSeconds(name)
  if (direct !== null) return { name, timestamp: direct, rank: 0 }
  const stripped = withoutNameSuffix(name)
  if (stripped === name) return null
  const timestamp = autoNameSeconds(stripped)
  if (timestamp === null) return null
  const match = NAME_SUFFIX_PATTERN.exec(name)
  return { name, timestamp, rank: match ? Number(match[2]) : 0 }
}

/**
 * 自动备份的保留裁剪：只认 `auto-YYYYMMDD.db`（及同日多份的 `-<n>` 后缀），
 * 按名字里的日期新 → 旧保留前 `keep` 个，返回该删的文件名。
 *
 * 同一天多份时先比后缀号（base 最早、后缀越大越新），再比名字 —— 边界由排序规则定死，
 * 不依赖目录返回顺序的偶然性。
 *
 * 手动备份与 pre-restore 永远不参与 —— 「我特意留下的那一份」不能被自动清理吃掉。
 */
export function autoBackupsToDelete(names: string[], keep: number = AUTO_BACKUP_KEEP): string[] {
  const autos: AutoEntry[] = []
  for (const name of names) {
    const entry = autoEntryOf(name)
    if (entry) autos.push(entry)
  }
  autos.sort(
    (left, right) =>
      right.timestamp - left.timestamp ||
      right.rank - left.rank ||
      left.name.localeCompare(right.name),
  )
  // keep 为负按 0 处理：删完比留负数个更接近调用方的意图
  return autos.slice(Math.max(0, keep)).map((entry) => entry.name)
}

// ---------------------------------------------------------------- 最近工作空间

/** 前插、去重（同路径只留最新那条）、最多 {@link RECENT_WORKSPACE_LIMIT} 条；空串不进去。 */
export function addRecentWorkspace(list: readonly string[], dir: string): string[] {
  const target = dir.trim()
  const result: string[] = []
  if (target.length > 0) result.push(target)
  for (const item of list) {
    if (typeof item !== 'string') continue
    const path = item.trim()
    if (path.length === 0 || result.includes(path)) continue
    result.push(path)
    if (result.length >= RECENT_WORKSPACE_LIMIT) break
  }
  return result
}

/** 配置文件里的最近工作空间：未知输入 → `[]`，脏值逐条丢掉。 */
export function normalizeRecentWorkspaces(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const result: string[] = []
  for (const item of value) {
    if (typeof item !== 'string') continue
    const path = item.trim()
    if (path.length === 0 || result.includes(path)) continue
    result.push(path)
    if (result.length >= RECENT_WORKSPACE_LIMIT) break
  }
  return result
}

// ---------------------------------------------------------------- 展示

/** 字节数 → `812 B` / `1.2 KB` / `3.4 MB`（按 1024 进位，一位小数）。 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return `0 ${SIZE_UNITS[0]}`
  let value = bytes
  let unit = 0
  while (value >= BYTES_PER_UNIT && unit < SIZE_UNITS.length - 1) {
    value /= BYTES_PER_UNIT
    unit += 1
  }
  if (unit === 0) return `${Math.round(value)} ${SIZE_UNITS[0]}`
  return `${value.toFixed(1)} ${SIZE_UNITS[unit]}`
}

// ---------------------------------------------------------------- 快照校验

/**
 * 快照校验结论。判定顺序写死：
 *
 * 1. 打不开 → 损坏（原因 `打不开`）
 * 2. 快速检查失败 → 损坏（原因取原文）
 * 3. 没有 app_meta → 不是工作空间
 * 4. 库版本高于本程序 → 版本过高
 * 5. 其余 → 可恢复
 *
 * 损坏排在版本之前：一句「请更新应用」盖住真正的损坏，会让人升完级还是恢复不了。
 */
export function judgeSnapshot(probe: SnapshotProbe, supportedVersion: number): SnapshotVerdict {
  if (!probe.opened) return { status: 'corrupt', reason: '打不开' }
  if (probe.quickCheck !== 'ok') return { status: 'corrupt', reason: probe.quickCheck }
  if (!probe.hasAppMeta) return { status: 'not-workspace' }
  if (probe.schemaVersion > supportedVersion) {
    return { status: 'newer', schemaVersion: probe.schemaVersion, supported: supportedVersion }
  }
  return { status: 'ok', schemaVersion: probe.schemaVersion }
}

/** 校验结论 → 给人看的一句话（可恢复时为空串）。 */
export function snapshotProblem(verdict: SnapshotVerdict): string {
  switch (verdict.status) {
    case 'ok':
      return ''
    case 'corrupt':
      return `这份备份已损坏，不能恢复（${verdict.reason}）`
    case 'not-workspace':
      return '这不是 Transactions 工作空间（缺少 app_meta）'
    case 'newer':
      return `这份备份的库版本（${verdict.schemaVersion}）高于本程序支持的（${verdict.supported}），请先更新应用`
  }
}
