import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { closeWorkspace, currentWorkspace, openWorkspace } from '../../electron/db'
import { openDatabase, probeDatabase, type Db } from '../../electron/db/driver'
import { MIGRATIONS } from '../../electron/db/migrate'
import { create } from '../../electron/db/dao/transaction-record'
import {
  backupDirProblem,
  createBackupService,
  type BackupServiceOptions,
} from '../../electron/services/backup'
import {
  autoBackupName,
  judgeSnapshot,
  manualBackupName,
  preRestoreName,
} from '../../shared/domain/backup'
import { AppError } from '../../shared/errors'

const SUPPORTED_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version
const directories: string[] = []

interface Fixture {
  workspaceDirectory: string
  backupDirectory: string
  /** 服务注入的时钟：测试要能走进"昨天 / 今天 / 明天" */
  clock: { value: Date }
}

function setup(): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'tr-backup-service-'))
  directories.push(root)
  return {
    workspaceDirectory: join(root, 'workspace'),
    backupDirectory: join(root, 'backups'),
    clock: { value: new Date(2026, 4, 1, 10, 30, 0) },
  }
}

function serviceFor(
  fixture: Fixture,
  overrides: Partial<BackupServiceOptions> = {},
): ReturnType<typeof createBackupService> {
  return createBackupService({
    workspace: () => currentWorkspace(),
    backupDir: () => fixture.backupDirectory,
    autoBackupEnabled: () => true,
    supportedSchemaVersion: SUPPORTED_VERSION,
    closeWorkspace,
    restart: () => {},
    now: () => fixture.clock.value,
    ...overrides,
  })
}

function insertLedger(db: Db, id: string): void {
  db.prepare(
    'INSERT INTO ledger (id, name, description, created_at, updated_at) VALUES (?, ?, ?, 1, 1)',
  ).run(id, id, '')
}

function insertRecord(db: Db, id: string): void {
  create(
    db,
    {
      transactionId: id,
      ledgerId: 'l1',
      amountCents: 1_200,
      transactionType: 'expense',
      category: '餐饮美食',
      description: `记录${id}`,
      flags: JSON.stringify({ outlier: false }),
      keyEventDate: '',
      transactionAt: 1_700_000_000,
      createdAt: 0,
      updatedAt: 0,
    },
    1_700_000_000,
  )
}

function ledgerIds(db: Db): string[] {
  return (db.prepare('SELECT id FROM ledger ORDER BY id').all() as Array<{ id: string }>).map(
    (row) => row.id,
  )
}

function writeAsset(workspaceDirectory: string, relativePath: string, content: string): string {
  const target = join(workspaceDirectory, 'data', 'assets', relativePath)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
  return target
}

function capture(run: () => void): AppError {
  try {
    run()
  } catch (error) {
    if (error instanceof AppError) return error
    throw error
  }
  throw new Error('应当抛出 AppError')
}

afterEach(() => {
  vi.useRealTimers()
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('backupDirProblem', () => {
  it('rejects the workspace itself and anything inside it', () => {
    const workspace = join(tmpdir(), 'tr-problem-ws')
    expect(backupDirProblem(workspace, workspace)).not.toBe('')
    expect(backupDirProblem(join(workspace, 'backup'), workspace)).not.toBe('')
    expect(backupDirProblem(join(workspace, 'a', 'b'), workspace)).not.toBe('')
  })

  it('accepts a sibling directory that merely shares the prefix', () => {
    const workspace = join(tmpdir(), 'tr-problem-ws')
    expect(backupDirProblem(join(tmpdir(), 'tr-problem-ws-2'), workspace)).toBe('')
    expect(backupDirProblem(join(tmpdir(), 'elsewhere'), workspace)).toBe('')
  })
})

describe('manual backup', () => {
  it('creates a directory with a consistent snapshot, the record and the images', () => {
    const fixture = setup()
    const workspace = openWorkspace(fixture.workspaceDirectory)
    insertLedger(workspace.db, 'l1')
    insertRecord(workspace.db, 't1')
    writeAsset(fixture.workspaceDirectory, 'key_events/2026-05-01/a.png', 'png-bytes')

    const result = serviceFor(fixture).createManual()

    expect(result.name).toBe(manualBackupName(fixture.clock.value))
    expect(result.path).toBe(join(fixture.backupDirectory, result.name))
    expect(statSync(result.path).isDirectory()).toBe(true)
    expect(result.sizeBytes).toBeGreaterThan(0)
    expect(typeof result.durationMs).toBe('number')
    expect(result.createdAt).toBe(Math.trunc(fixture.clock.value.getTime() / 1000))

    // 快照库能独立只读打开，版本与快速检查都对
    const snapshotPath = join(result.path, 'transactions.db')
    expect(existsSync(snapshotPath)).toBe(true)
    const probe = probeDatabase(snapshotPath)
    expect(probe.opened).toBe(true)
    expect(probe.quickCheck).toBe('ok')
    expect(probe.hasAppMeta).toBe(true)
    expect(probe.schemaVersion).toBe(SUPPORTED_VERSION)
    expect(judgeSnapshot(probe, SUPPORTED_VERSION).status).toBe('ok')

    // 刚写的记录在快照里
    const snapshot = openDatabase(snapshotPath)
    try {
      const row = snapshot
        .prepare('SELECT description FROM transaction_record WHERE transaction_id = ?')
        .get('t1') as { description: string } | undefined
      expect(row?.description).toBe('记录t1')
    } finally {
      snapshot.close()
    }

    // 图片资产一起备份
    expect(
      existsSync(join(result.path, 'data', 'assets', 'key_events', '2026-05-01', 'a.png')),
    ).toBe(true)
  })

  it('rejects a backup directory inside the workspace without creating anything', () => {
    const fixture = setup()
    const inside = join(fixture.workspaceDirectory, 'backups')
    openWorkspace(fixture.workspaceDirectory)

    const error = capture(() =>
      serviceFor(fixture, { backupDir: () => inside }).createManual(),
    )

    expect(error.status).toBe(400)
    expect(error.message).toContain('工作空间内部')
    expect(existsSync(inside)).toBe(false)
  })
})

describe('backup list', () => {
  it('returns an empty list when the backup directory does not exist', () => {
    const fixture = setup()
    expect(serviceFor(fixture).list()).toEqual([])
    expect(existsSync(fixture.backupDirectory)).toBe(false)
  })

  it('lists recognized backups newest first with their metadata', () => {
    const fixture = setup()
    const workspace = openWorkspace(fixture.workspaceDirectory)
    insertLedger(workspace.db, 'l1')
    writeAsset(fixture.workspaceDirectory, 'key_events/a.png', 'a')
    const service = serviceFor(fixture)

    fixture.clock.value = new Date(2026, 4, 1, 10, 0, 0)
    const older = service.createManual()
    fixture.clock.value = new Date(2026, 4, 2, 11, 0, 0)
    const newer = service.createManual()
    fixture.clock.value = new Date(2026, 4, 4, 8, 0, 0)
    const auto = service.autoBackupIfNeeded()
    expect(auto?.name).toBe(autoBackupName('2026-05-04'))

    const entries = service.list()
    expect(entries.map((entry) => entry.name)).toEqual([
      autoBackupName('2026-05-04'),
      newer.name,
      older.name,
    ])

    const [autoEntry, newerEntry, olderEntry] = entries
    expect(autoEntry.kind).toBe('auto')
    expect(autoEntry.hasAssets).toBe(false)
    expect(autoEntry.restorable).toBe(true)
    expect(autoEntry.schemaVersion).toBe(SUPPORTED_VERSION)
    expect(autoEntry.path).toBe(join(fixture.backupDirectory, autoEntry.name))
    expect(autoEntry.createdAt).toBe(Math.trunc(new Date(2026, 4, 4).getTime() / 1000))
    expect(autoEntry.sizeBytes).toBeGreaterThan(0)

    expect(olderEntry.kind).toBe('manual')
    expect(olderEntry.hasAssets).toBe(true)
    expect(olderEntry.restorable).toBe(true)
    expect(olderEntry.problem).toBe('')
    expect(newerEntry.createdAt).toBeGreaterThan(olderEntry.createdAt)
  })

  it('keeps same-second backups visible under their -2 suffix', () => {
    const fixture = setup()
    openWorkspace(fixture.workspaceDirectory)
    const service = serviceFor(fixture)

    // 同一秒连点两次：第二份被 uniqueName 加上了 -2，列表里不能因此消失
    const first = service.createManual()
    const second = service.createManual()
    expect(second.name).toBe(`${first.name}-2`)

    const names = service.list().map((entry) => entry.name)
    expect(names).toContain(first.name)
    expect(names).toContain(second.name)
  })

  it('marks candidates that cannot be restored with their problem', () => {
    const fixture = setup()
    mkdirSync(fixture.backupDirectory, { recursive: true })

    const newerPath = join(fixture.backupDirectory, preRestoreName(new Date(2026, 0, 1, 0, 0, 0)))
    const newer = openDatabase(newerPath)
    newer.exec('CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
    newer.exec("INSERT INTO app_meta VALUES ('schema_version', '999')")
    newer.close()

    const corruptPath = join(
      fixture.backupDirectory,
      preRestoreName(new Date(2026, 0, 2, 0, 0, 0)),
    )
    writeFileSync(corruptPath, 'this is not a database')

    const plainPath = join(fixture.backupDirectory, preRestoreName(new Date(2026, 0, 3, 0, 0, 0)))
    const plain = openDatabase(plainPath)
    plain.exec('CREATE TABLE something_else (id TEXT)')
    plain.close()

    const entries = serviceFor(fixture).list()
    const byName = (name: string) => entries.find((entry) => entry.name === name)

    const newerEntry = byName(preRestoreName(new Date(2026, 0, 1, 0, 0, 0)))
    expect(newerEntry?.status).toBe('newer')
    expect(newerEntry?.restorable).toBe(false)
    expect(newerEntry?.problem).toContain('高于本程序支持')

    const corruptEntry = byName(preRestoreName(new Date(2026, 0, 2)))
    expect(corruptEntry?.status).toBe('corrupt')
    expect(corruptEntry?.restorable).toBe(false)
    expect(corruptEntry?.problem).toContain('已损坏')

    const plainEntry = byName(preRestoreName(new Date(2026, 0, 3)))
    expect(plainEntry?.status).toBe('not-workspace')
    expect(plainEntry?.restorable).toBe(false)
    expect(plainEntry?.problem).toContain('不是 Transactions 工作空间')
  })
})

describe('auto backup', () => {
  it('creates at most one auto backup per day', () => {
    const fixture = setup()
    openWorkspace(fixture.workspaceDirectory)
    const service = serviceFor(fixture)

    const first = service.autoBackupIfNeeded()
    expect(first?.kind).toBe('auto')
    expect(first?.name).toBe(autoBackupName('2026-05-01'))
    expect(existsSync(join(fixture.backupDirectory, 'auto-20260501.db'))).toBe(true)

    // 同一天再开一次：已经有今天这份，不再写盘
    expect(service.autoBackupIfNeeded()).toBeNull()
  })

  it('is skipped when the switch is off', () => {
    const fixture = setup()
    openWorkspace(fixture.workspaceDirectory)
    const service = serviceFor(fixture, { autoBackupEnabled: () => false })

    expect(service.autoBackupIfNeeded()).toBeNull()
    expect(existsSync(join(fixture.backupDirectory, 'auto-20260501.db'))).toBe(false)
  })

  it('creates today when only older snapshots exist', () => {
    const fixture = setup()
    openWorkspace(fixture.workspaceDirectory)
    mkdirSync(fixture.backupDirectory, { recursive: true })
    writeFileSync(join(fixture.backupDirectory, 'auto-20260430.db'), '')

    expect(serviceFor(fixture).autoBackupIfNeeded()?.name).toBe(autoBackupName('2026-05-01'))
    expect(existsSync(join(fixture.backupDirectory, 'auto-20260501.db'))).toBe(true)
  })

  it('prunes old auto snapshots but never the manual ones', () => {
    const fixture = setup()
    const workspace = openWorkspace(fixture.workspaceDirectory)
    insertLedger(workspace.db, 'l1')
    const service = serviceFor(fixture)

    // 预置 8 份旧的自动备份 + 一份手动备份（手动那次落在别的日子）
    fixture.clock.value = new Date(2026, 3, 20, 9, 0, 0)
    const manual = service.createManual()
    mkdirSync(fixture.backupDirectory, { recursive: true })
    for (const day of [20, 21, 22, 23, 24, 25, 26, 27]) {
      writeFileSync(join(fixture.backupDirectory, `auto-202604${day}.db`), '')
    }

    fixture.clock.value = new Date(2026, 4, 1, 10, 30, 0)
    service.autoBackupIfNeeded()

    const names = readdirSync(fixture.backupDirectory)
    const autos = names.filter((name) => name.startsWith('auto-')).sort()
    expect(autos).toEqual([
      'auto-20260422.db',
      'auto-20260423.db',
      'auto-20260424.db',
      'auto-20260425.db',
      'auto-20260426.db',
      'auto-20260427.db',
      'auto-20260501.db',
    ])
    // 手动备份不参与裁剪
    expect(names).toContain(manual.name)
    expect(existsSync(manual.path)).toBe(true)
  })
})

describe('restore', () => {
  it('restores the snapshot, keeps a pre-restore copy and reopens cleanly', () => {
    const fixture = setup()
    const workspace = openWorkspace(fixture.workspaceDirectory)
    insertLedger(workspace.db, 'l1')
    const service = serviceFor(fixture)
    const backup = service.createManual()

    insertLedger(workspace.db, 'l2')
    expect(ledgerIds(workspace.db)).toEqual(['l1', 'l2'])

    const result = service.restore(backup.path)

    expect(result.restoredFrom).toBe(backup.path)
    // 恢复必然关库，等应用重启
    expect(currentWorkspace()).toBeNull()
    expect(result.preRestorePath.startsWith(join(fixture.backupDirectory, 'pre-restore-'))).toBe(
      true,
    )
    expect(existsSync(result.preRestorePath)).toBe(true)

    // 恢复前的当前数据（含 l2）被另存下来了
    const preRestore = openDatabase(result.preRestorePath)
    try {
      expect(ledgerIds(preRestore)).toEqual(['l1', 'l2'])
    } finally {
      preRestore.close()
    }

    // 重新打开工作空间：回到快照状态
    const reopened = openWorkspace(fixture.workspaceDirectory)
    expect(ledgerIds(reopened.db)).toEqual(['l1'])
  })

  it('restores the images of a manual backup directory', () => {
    const fixture = setup()
    openWorkspace(fixture.workspaceDirectory)
    writeAsset(fixture.workspaceDirectory, 'key_events/a.png', 'A')
    const service = serviceFor(fixture)
    const backup = service.createManual()

    rmSync(join(fixture.workspaceDirectory, 'data', 'assets', 'key_events', 'a.png'))
    writeAsset(fixture.workspaceDirectory, 'key_events/b.png', 'B')

    service.restore(backup.path)

    const assets = join(fixture.workspaceDirectory, 'data', 'assets', 'key_events')
    expect(existsSync(join(assets, 'a.png'))).toBe(true)
    expect(existsSync(join(assets, 'b.png'))).toBe(false)
  })

  it('keeps the current images when restoring a single-file snapshot', () => {
    const fixture = setup()
    openWorkspace(fixture.workspaceDirectory)
    writeAsset(fixture.workspaceDirectory, 'key_events/a.png', 'A')
    const service = serviceFor(fixture)
    const auto = service.autoBackupIfNeeded()
    expect(auto).not.toBeNull()

    rmSync(join(fixture.workspaceDirectory, 'data', 'assets', 'key_events', 'a.png'))
    writeAsset(fixture.workspaceDirectory, 'key_events/b.png', 'B')

    service.restore(auto!.path)

    const assets = join(fixture.workspaceDirectory, 'data', 'assets', 'key_events')
    // 单文件只换库：备份之后加进来的图片还在，备份里没有的图片不会被补回来
    expect(existsSync(join(assets, 'a.png'))).toBe(false)
    expect(existsSync(join(assets, 'b.png'))).toBe(true)
    // 库仍然可打开
    expect(ledgerIds(openWorkspace(fixture.workspaceDirectory).db)).toEqual([])
  })

  it('schedules the restart 600ms after returning', () => {
    const fixture = setup()
    openWorkspace(fixture.workspaceDirectory)
    const restart = vi.fn()
    vi.useFakeTimers()
    const service = serviceFor(fixture, { restart })
    const backup = service.createManual()

    service.restore(backup.path)

    expect(restart).not.toHaveBeenCalled()
    vi.advanceTimersByTime(599)
    expect(restart).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(restart).toHaveBeenCalledTimes(1)
  })

  it('refuses to restore from the live database itself', () => {
    const fixture = setup()
    const workspace = openWorkspace(fixture.workspaceDirectory)

    const error = capture(() => serviceFor(fixture).restore(workspace.databasePath))

    expect(error.status).toBe(400)
    expect(error.message).toContain('当前正在使用的库')
    expect(currentWorkspace()).not.toBeNull()
  })

  it('rejects a path that does not exist', () => {
    const fixture = setup()
    openWorkspace(fixture.workspaceDirectory)
    const missing = join(fixture.backupDirectory, 'nope.db')

    const error = capture(() => serviceFor(fixture).restore(missing))

    expect(error.status).toBe(400)
    expect(error.message).toContain('备份不存在')
  })

  it('rejects a candidate that is not restorable and keeps the workspace open', () => {
    const fixture = setup()
    openWorkspace(fixture.workspaceDirectory)
    mkdirSync(fixture.backupDirectory, { recursive: true })
    const corrupt = join(fixture.backupDirectory, 'auto-20260101.db')
    writeFileSync(corrupt, 'this is not a database')

    const error = capture(() => serviceFor(fixture).restore(corrupt))

    expect(error.status).toBe(400)
    expect(error.message).toContain('已损坏')
    // 校验失败不该关掉当前工作空间
    expect(currentWorkspace()).not.toBeNull()
  })
})
