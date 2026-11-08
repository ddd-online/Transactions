/**
 * 备份 / 恢复在磁盘上的那一半。
 *
 * 本文件**不 import electron**：`workspace` / `backupDir` / `autoBackupEnabled` / `restart` /
 * `closeWorkspace` / `now` 全部由调用方注入，所以 vitest 里能拿真实临时目录直接跑。
 * 文件名、保留裁剪、快照判定这些纯逻辑在 `shared/domain/backup`，这里只消费它们。
 *
 * 恢复的顺序是契约（见共享契约 §6）：校验候选 → 空间校验 → 另存当前库 → 关库 →
 * 删库与 `-wal` / `-shm` → 写入快照 → 稍后重启。顺序不能换：`pre-restore` 副本必须
 * 在删任何一个当前文件之前落盘。
 */

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs'
import { statfsSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'

import type { Db } from '../db/driver'
import { probeDatabase, stampWorkspaceDir } from '../db/driver'
import type {
  BackupEntryDto,
  BackupResultDto,
  RestoreResultDto,
} from '../../shared/types/backup'
import {
  autoBackupName,
  autoBackupsToDelete,
  formatBytes,
  judgeSnapshot,
  manualBackupName,
  parseBackupName,
  preRestoreName,
  snapshotProblem,
  uniqueName,
  type SnapshotProbe,
} from '../../shared/domain/backup'
import { formatTimestamp } from '../../shared/domain/time'
import { AppError, errorMessage, workspaceNotOpened } from '../../shared/errors'

/** 恢复后等界面把回执说完再重启的间隔（与更新安装同一节奏）。 */
export const RESTART_DELAY_MS = 600

export interface BackupWorkspace {
  directory: string
  databasePath: string
  db: Db
}

export interface BackupServiceOptions {
  workspace: () => BackupWorkspace | null
  backupDir: () => string
  autoBackupEnabled: () => boolean
  supportedSchemaVersion: number
  closeWorkspace: () => void
  restart: () => void
  now: () => Date
  log?: (message: string) => void
}

export interface BackupService {
  createManual(): BackupResultDto
  list(): BackupEntryDto[]
  restore(path: string): RestoreResultDto
  /** 今天已有 / 开关关着 → null */
  autoBackupIfNeeded(): BackupEntryDto | null
}

/** 比较路径时的同一口径：解析成绝对路径、去掉尾部分隔符、Windows 不区分大小写。 */
export function comparable(path: string): string {
  return resolve(path)
    .replace(/[\\/]+$/, '')
    .toLowerCase()
}

/**
 * 备份位置落在工作空间里时返回一句原因，否则空串。
 *
 * IPC（设置备份位置）与 service（真去写盘）共用这一处，避免「设置里能过、备份时才炸」。
 */
export function backupDirProblem(backupDir: string, workspaceDir: string): string {
  if (!workspaceDir.trim()) return ''
  const workspace = comparable(workspaceDir)
  const backup = comparable(backupDir)
  if (backup === workspace) {
    return `备份位置不能是工作空间目录本身（${workspaceDir}）`
  }
  if (backup.startsWith(`${workspace}${sep}`)) {
    return `备份位置不能放在工作空间内部（${workspaceDir}），否则备份会把自己也备进去`
  }
  return ''
}

function directorySize(path: string): number {
  let total = 0
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const child = join(path, entry.name)
    if (entry.isDirectory()) total += directorySize(child)
    else if (entry.isFile()) total += statSync(child).size
  }
  return total
}

function entrySize(path: string): number {
  const stats = statSync(path)
  return stats.isDirectory() ? directorySize(path) : stats.size
}

function copyDirectory(source: string, target: string): void {
  mkdirSync(target, { recursive: true })
  for (const entry of readdirSync(source, { withFileTypes: true })) {
    const from = join(source, entry.name)
    const to = join(target, entry.name)
    if (entry.isDirectory()) copyDirectory(from, to)
    else if (entry.isFile()) copyFileSync(from, to)
  }
}

/** `VACUUM INTO`：运行中的库拿一致性快照，不复制 `-wal` / `-shm`；目标必须不存在。 */
function vacuumInto(db: Db, target: string): void {
  if (existsSync(target)) rmSync(target, { force: true })
  const escaped = target.replace(/'/g, "''")
  db.exec(`VACUUM INTO '${escaped}'`)
}

/** 只读探一份快照；打不开就记成 `opened: false`，不往外抛。 */
function probeOf(path: string, options: { deep?: boolean } = {}): SnapshotProbe {
  try {
    return probeDatabase(path, options)
  } catch {
    return { opened: false, hasAppMeta: false, schemaVersion: 0, workspaceDir: '', quickCheck: '' }
  }
}

/**
 * 产出的快照必须过全量检查。
 *
 * 全量只在这两个显式动作上跑（产出备份 / 恢复候选）；产出一份通不过检查的快照比没有备份
 * 更危险 —— 用户会以为数据已经在里面了。
 */
function passesIntegrityCheck(path: string): boolean {
  const probe = probeOf(path, { deep: true })
  return probe.opened && probe.quickCheck === 'ok'
}

/** 工作空间所在盘的可用字节；拿不到（平台不支持 / 无权限）返回 null。 */
function availableBytes(directory: string): number | null {
  try {
    const stats = statfsSync(directory)
    return Number(stats.bavail) * Number(stats.bsize)
  } catch {
    return null
  }
}

export function createBackupService(options: BackupServiceOptions): BackupService {
  function requireWorkspace(): BackupWorkspace {
    const workspace = options.workspace()
    if (!workspace) throw workspaceNotOpened()
    return workspace
  }

  function buildEntry(directory: string, name: string): BackupEntryDto | null {
    const parsed = parseBackupName(name)
    if (!parsed) return null
    const path = join(directory, name)
    let sizeBytes = 0
    try {
      sizeBytes = entrySize(path)
    } catch {
      return null
    }
    const manual = parsed.kind === 'manual'
    const probe = probeOf(manual ? join(path, 'transactions.db') : path)
    const verdict = judgeSnapshot(probe, options.supportedSchemaVersion)
    return {
      path,
      name,
      kind: parsed.kind,
      createdAt: parsed.timestamp,
      sizeBytes,
      schemaVersion: probe.schemaVersion,
      workspaceDir: probe.workspaceDir,
      hasAssets: manual && existsSync(join(path, 'data', 'assets')),
      restorable: verdict.status === 'ok',
      status: verdict.status,
      problem: snapshotProblem(verdict),
    }
  }

  function list(): BackupEntryDto[] {
    const directory = options.backupDir()
    if (!existsSync(directory)) return []
    let names: string[]
    try {
      names = readdirSync(directory)
    } catch (error) {
      options.log?.(`读取备份目录失败: ${errorMessage(error)}`)
      return []
    }
    const entries: BackupEntryDto[] = []
    for (const name of names) {
      const entry = buildEntry(directory, name)
      if (entry) entries.push(entry)
    }
    // 新的在前；同一秒的按名字稳住顺序（排序不稳定时界面会跳）
    entries.sort((left, right) =>
      right.createdAt === left.createdAt
        ? left.name.localeCompare(right.name)
        : right.createdAt - left.createdAt,
    )
    return entries
  }

  function createManual(): BackupResultDto {
    const workspace = requireWorkspace()
    const directory = options.backupDir()
    const problem = backupDirProblem(directory, workspace.directory)
    if (problem) throw new AppError(problem, { status: 400 })

    const startedAt = Date.now()
    mkdirSync(directory, { recursive: true })
    const name = uniqueName(manualBackupName(options.now()), (candidate) =>
      existsSync(join(directory, candidate)),
    )
    const target = join(directory, name)
    mkdirSync(target)
    const snapshotPath = join(target, 'transactions.db')
    vacuumInto(workspace.db, snapshotPath)
    // 快照记住自己来自哪个工作空间：列表据此分辨归属、恢复时据此提醒
    stampWorkspaceDir(snapshotPath, workspace.directory)
    // 全量检查：产出一份坏快照比没有备份更危险
    if (!passesIntegrityCheck(snapshotPath)) {
      rmSync(target, { recursive: true, force: true })
      throw new AppError(`备份产出的快照没有通过完整性检查，已删除：${name}`)
    }

    const assetsSource = join(workspace.directory, 'data', 'assets')
    if (existsSync(assetsSource)) {
      copyDirectory(assetsSource, join(target, 'data', 'assets'))
    }

    return {
      name,
      path: target,
      sizeBytes: directorySize(target),
      durationMs: Date.now() - startedAt,
      createdAt: Math.trunc(options.now().getTime() / 1000),
    }
  }

  /**
   * 今天已有当前工作空间的一份 → 视为「今天做过了」。
   *
   * 标记为空（升级前产出的文件 / 读不到）按「当前的」算：否则升级当天会为每个工作空间
   * 多产一份。标记属于别的工作空间时不算，B 会拿到 `auto-YYYYMMDD-2.db`。
   */
  function autoBackupCoversWorkspace(path: string, workspace: BackupWorkspace): boolean {
    const marker = probeOf(path).workspaceDir.trim()
    return marker === '' || comparable(marker) === comparable(workspace.directory)
  }

  /** 只裁剪自动备份：手动备份与 pre-restore 永远不参与。 */
  function pruneAutoBackups(directory: string): void {
    for (const stale of autoBackupsToDelete(readdirSync(directory))) {
      try {
        rmSync(join(directory, stale), { force: true })
      } catch (error) {
        options.log?.(`清理旧自动备份失败: ${errorMessage(error)}`)
      }
    }
  }

  function autoBackupIfNeeded(): BackupEntryDto | null {
    if (!options.autoBackupEnabled()) return null
    const workspace = options.workspace()
    if (!workspace) return null
    const directory = options.backupDir()
    // 配置被手改成工作空间内部时静默跳过：打开工作空间不能因此失败
    if (backupDirProblem(directory, workspace.directory)) return null

    const todayName = autoBackupName(
      formatTimestamp(Math.trunc(options.now().getTime() / 1000), 'YYYY-MM-DD'),
    )
    // 同一天同一工作空间只做一次：base 或它的 -2 / -3 后缀里只要有一份属于当前
    // 工作空间（或标记为空）就算今天做过了。只看 base 的话，B 每打开一次就会多产一份。
    const todayStem = todayName.slice(0, -'.db'.length)
    const sameDayPattern = new RegExp(`^${todayStem}-\\d+\\.db$`)
    const covered =
      existsSync(directory) &&
      readdirSync(directory).some(
        (candidate) =>
          (candidate === todayName || sameDayPattern.test(candidate)) &&
          autoBackupCoversWorkspace(join(directory, candidate), workspace),
      )

    let created: string | null = null
    if (!covered) {
      mkdirSync(directory, { recursive: true })
      // 同一天的下一个工作空间用 uniqueName 产 -2 / -3，不另写一套名字规则
      const name = uniqueName(todayName, (candidate) => existsSync(join(directory, candidate)))
      const target = join(directory, name)
      vacuumInto(workspace.db, target)
      stampWorkspaceDir(target, workspace.directory)
      if (!passesIntegrityCheck(target)) {
        rmSync(target, { force: true })
        throw new AppError(`备份产出的快照没有通过完整性检查，已删除：${name}`)
      }
      created = name
    }

    // 无论这次有没有写盘都要裁剪：只在新建时裁的话，攒到 8 份也降不下来。
    // 快速检查也打不开的目录（例如没有权限）不能让「打开工作空间」失败
    try {
      pruneAutoBackups(directory)
    } catch (error) {
      options.log?.(`清理旧自动备份失败: ${errorMessage(error)}`)
    }
    return created ? buildEntry(directory, created) : null
  }

  function restore(source: string): RestoreResultDto {
    const workspace = requireWorkspace()
    const requested = source.trim()
    if (!requested || !existsSync(requested)) {
      throw new AppError(`备份不存在：${requested}`, { status: 400 })
    }
    const isDirectory = statSync(requested).isDirectory()
    const snapshotPath = isDirectory ? join(requested, 'transactions.db') : requested
    if (!existsSync(snapshotPath)) {
      throw new AppError(`备份不存在：${requested}`, { status: 400 })
    }
    // 用户手选到「当前正在用的这个库」时，后面的删库会先把源文件删掉：当场拒绝
    if (comparable(snapshotPath) === comparable(workspace.databasePath)) {
      throw new AppError('不能从当前正在使用的库恢复，请选择另一份备份', { status: 400 })
    }

    // 1. 校验候选：只读打开、全量检查、app_meta、库版本不高于本程序
    const verdict = judgeSnapshot(probeOf(snapshotPath, { deep: true }), options.supportedSchemaVersion)
    if (verdict.status !== 'ok') {
      throw new AppError(snapshotProblem(verdict), { status: 400 })
    }

    const backupDirectory = options.backupDir()
    const dirProblem = backupDirProblem(backupDirectory, workspace.directory)
    if (dirProblem) throw new AppError(dirProblem, { status: 400 })
    mkdirSync(backupDirectory, { recursive: true })

    // 2. 目标盘剩余空间：先把大小算清，别出现「删掉当前库、复制失败」
    const needBytes = entrySize(requested)
    const available = availableBytes(workspace.directory)
    if (available !== null && needBytes > available) {
      throw new AppError(
        `恢复需要 ${formatBytes(needBytes)}，当前工作空间所在磁盘只剩 ${formatBytes(available)}，请先腾出空间`,
        { status: 400 },
      )
    }
    if (available === null) {
      options.log?.('无法读取磁盘剩余空间，跳过恢复前的空间校验')
    }

    // 3. 先把当前数据另存一份（恢复没有「撤销」，这一步是硬要求）
    const preRestoreNameValue = uniqueName(preRestoreName(options.now()), (candidate) =>
      existsSync(join(backupDirectory, candidate)),
    )
    const preRestorePath = join(backupDirectory, preRestoreNameValue)
    vacuumInto(workspace.db, preRestorePath)
    // pre-restore 同样是列表里会看到的一份快照：也盖上来源工作空间
    stampWorkspaceDir(preRestorePath, workspace.directory)

    // 4. 关库；5. 删掉当前库与 -wal / -shm；6. 写入快照
    options.closeWorkspace()
    try {
      for (const suffix of ['', '-wal', '-shm']) {
        rmSync(`${workspace.databasePath}${suffix}`, { force: true })
      }
      copyFileSync(snapshotPath, workspace.databasePath)
      // 手动备份（目录）带图片时才替换；单文件快照只换库，现有图片不动
      const assetsSource = join(requested, 'data', 'assets')
      if (isDirectory && existsSync(assetsSource)) {
        const assetsTarget = join(workspace.directory, 'data', 'assets')
        rmSync(assetsTarget, { recursive: true, force: true })
        copyDirectory(assetsSource, assetsTarget)
      }
    } catch (error) {
      throw new AppError(
        `恢复失败，当前数据已经另存为 ${preRestorePath}：${errorMessage(error)}`,
        { status: 500 },
      )
    }

    // 7. 让 IPC 先回包、让界面说得出话，再重启
    setTimeout(() => options.restart(), RESTART_DELAY_MS)
    return { preRestorePath, restoredFrom: source }
  }

  return { createManual, list, restore, autoBackupIfNeeded }
}

