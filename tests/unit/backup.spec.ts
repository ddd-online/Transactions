import { describe, expect, it } from 'vitest'

import {
  AUTO_BACKUP_KEEP,
  AUTO_BACKUP_PREFIX,
  BACKUP_DIR_NAME,
  MANUAL_BACKUP_PREFIX,
  PRE_RESTORE_PREFIX,
  RECENT_WORKSPACE_LIMIT,
  addRecentWorkspace,
  autoBackupName,
  autoBackupsToDelete,
  backupKindOf,
  defaultBackupDir,
  formatBytes,
  judgeSnapshot,
  manualBackupName,
  normalizeRecentWorkspaces,
  parseBackupName,
  preRestoreName,
  resolveBackupDir,
  snapshotProblem,
  uniqueName,
  type SnapshotProbe,
} from '../../shared/domain/backup'

/** 本地时区的 Unix 秒（与 `nowSeconds` 同一口径），测试自己算期望值。 */
function localSeconds(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): number {
  return Math.trunc(new Date(year, month - 1, day, hour, minute, second).getTime() / 1000)
}

describe('backup name constants', () => {
  // 这些名字是跨 ticket 的契约（磁盘布局按它认文件），钉死在这里
  it('match the shared contract', () => {
    expect(BACKUP_DIR_NAME).toBe('Transactions 备份')
    expect(MANUAL_BACKUP_PREFIX).toBe('Transactions-备份-')
    expect(AUTO_BACKUP_PREFIX).toBe('auto-')
    expect(PRE_RESTORE_PREFIX).toBe('pre-restore-')
    expect(AUTO_BACKUP_KEEP).toBe(7)
    expect(RECENT_WORKSPACE_LIMIT).toBe(5)
  })
})

describe('backup file names', () => {
  it('pads every field of a manual backup name', () => {
    expect(manualBackupName(new Date(2026, 0, 5, 3, 4, 5))).toBe(
      'Transactions-备份-20260105-030405',
    )
  })

  it('pads every field of a pre-restore name', () => {
    expect(preRestoreName(new Date(2026, 0, 5, 3, 4, 5))).toBe('pre-restore-20260105-030405.db')
  })

  it('keeps local time across the year boundary', () => {
    expect(manualBackupName(new Date(2025, 11, 31, 23, 59, 59))).toBe(
      'Transactions-备份-20251231-235959',
    )
    expect(manualBackupName(new Date(2026, 0, 1, 0, 0, 0))).toBe(
      'Transactions-备份-20260101-000000',
    )
    expect(preRestoreName(new Date(2025, 11, 31, 23, 59, 59))).toBe(
      'pre-restore-20251231-235959.db',
    )
  })

  it('turns a YYYY-MM-DD day into an auto backup file name', () => {
    expect(autoBackupName('2026-01-01')).toBe('auto-20260101.db')
    expect(autoBackupName('2026-12-31')).toBe('auto-20261231.db')
  })

  it('appends -2 / -3 before the extension when the name is taken', () => {
    const taken = new Set<string>()
    const exists = (candidate: string): boolean => taken.has(candidate)

    expect(uniqueName('auto-20260105.db', exists)).toBe('auto-20260105.db')
    taken.add('auto-20260105.db')
    expect(uniqueName('auto-20260105.db', exists)).toBe('auto-20260105-2.db')
    taken.add('auto-20260105-2.db')
    expect(uniqueName('auto-20260105.db', exists)).toBe('auto-20260105-3.db')
  })

  it('appends -2 / -3 at the end when the name has no extension', () => {
    // 手动备份是目录，名字里没有扩展名：后缀直接接在末尾
    const taken = new Set<string>(['Transactions-备份-20260105-030405'])
    const exists = (candidate: string): boolean => taken.has(candidate)

    expect(uniqueName('Transactions-备份-20260105-030405', exists)).toBe(
      'Transactions-备份-20260105-030405-2',
    )
    taken.add('Transactions-备份-20260105-030405-2')
    expect(uniqueName('Transactions-备份-20260105-030405', exists)).toBe(
      'Transactions-备份-20260105-030405-3',
    )
  })
})

describe('backup name recognition', () => {
  it('recognizes the three kinds and nothing else', () => {
    expect(backupKindOf('Transactions-备份-20260105-030405')).toBe('manual')
    expect(backupKindOf('auto-20260105.db')).toBe('auto')
    expect(backupKindOf('pre-restore-20260105-030405.db')).toBe('pre-restore')
    expect(backupKindOf('transactions.db')).toBeNull()
    expect(backupKindOf('auto-20260105')).toBeNull()
    expect(backupKindOf('Transactions-备份-20260105')).toBeNull()
    expect(backupKindOf('')).toBeNull()
  })

  it('reads the local timestamp back out of a name', () => {
    expect(parseBackupName('Transactions-备份-20260105-030405')).toEqual({
      kind: 'manual',
      timestamp: localSeconds(2026, 1, 5, 3, 4, 5),
    })
    expect(parseBackupName('pre-restore-20260105-030405.db')).toEqual({
      kind: 'pre-restore',
      timestamp: localSeconds(2026, 1, 5, 3, 4, 5),
    })
    // 自动备份只到天：时间取当天本地 00:00:00
    expect(parseBackupName('auto-20260105.db')).toEqual({
      kind: 'auto',
      timestamp: localSeconds(2026, 1, 5),
    })
  })

  it('rejects names it cannot read', () => {
    expect(parseBackupName('transactions.db')).toBeNull()
    expect(parseBackupName('auto-2026.db')).toBeNull()
    expect(parseBackupName('auto-20261340.db')).toBeNull()
    expect(parseBackupName('Transactions-备份-20260105')).toBeNull()
    expect(parseBackupName('Transactions-备份-20260105-0304')).toBeNull()
    expect(parseBackupName('')).toBeNull()
  })

  it('recognizes the -2 / -3 suffix uniqueName adds', () => {
    // 同一秒里的第二份被 uniqueName 改了名：不认这个后缀，它就会从列表里消失
    expect(parseBackupName('auto-20260105-2.db')).toEqual({
      kind: 'auto',
      timestamp: localSeconds(2026, 1, 5),
    })
    expect(parseBackupName('pre-restore-20260105-030405-2.db')).toEqual({
      kind: 'pre-restore',
      timestamp: localSeconds(2026, 1, 5, 3, 4, 5),
    })
    expect(parseBackupName('Transactions-备份-20260105-030405-2')).toEqual({
      kind: 'manual',
      timestamp: localSeconds(2026, 1, 5, 3, 4, 5),
    })
    expect(backupKindOf('auto-20260105-2.db')).toBe('auto')
    // 只剥一次后缀：叠两层就不是我们产出的名字了
    expect(parseBackupName('auto-20260105-2-3.db')).toBeNull()
    expect(parseBackupName('auto-20260105.db.bak')).toBeNull()
  })
})

describe('automatic backup retention', () => {
  const eightDays = [
    'auto-20260108.db',
    'auto-20260107.db',
    'auto-20260106.db',
    'auto-20260105.db',
    'auto-20260104.db',
    'auto-20260103.db',
    'auto-20260102.db',
    'auto-20260101.db',
  ]

  it('keeps the newest seven and returns the oldest one', () => {
    expect(autoBackupsToDelete(eightDays)).toEqual(['auto-20260101.db'])
  })

  it('keeps exactly seven untouched', () => {
    expect(autoBackupsToDelete(eightDays.slice(0, 7))).toEqual([])
    expect(autoBackupsToDelete([])).toEqual([])
  })

  it('only crops files it generated itself', () => {
    const names = [
      'auto-20260101.db',
      'auto-20260102.db',
      'auto-20260103.db',
      'auto-20260104.db',
      'auto-20260105.db',
      'auto-20260106.db',
      'auto-20260107.db',
      'auto-20260108.db',
      // 名字不规则 / 别的类型：一概不动
      'auto-2026.db',
      'auto-20260109.db.bak',
      'auto-20260110.bak',
      'Transactions-备份-20260105-030405',
      'pre-restore-20260105-030405.db',
      'transactions.db',
    ]

    expect(autoBackupsToDelete(names, 2)).toEqual([
      'auto-20260106.db',
      'auto-20260105.db',
      'auto-20260104.db',
      'auto-20260103.db',
      'auto-20260102.db',
      'auto-20260101.db',
    ])
  })

  it('never crops manual or pre-restore backups', () => {
    expect(
      autoBackupsToDelete([
        'Transactions-备份-20260101-030405',
        'Transactions-备份-20260102-030405',
        'pre-restore-20260101-030405.db',
        'pre-restore-20260102-030405.db',
      ]),
    ).toEqual([])
  })

  it('orders same-day duplicates deterministically and keeps the newest', () => {
    // 同一天的多份（base、-2、-3）：base 最早、后缀越大越新。
    // 边界必须靠排序规则定死，不能依赖目录返回顺序。
    const names = ['auto-20260105.db', 'auto-20260105-2.db', 'auto-20260105-3.db']
    expect(autoBackupsToDelete(names, 1)).toEqual(['auto-20260105-2.db', 'auto-20260105.db'])
    expect(autoBackupsToDelete([...names].reverse(), 1)).toEqual([
      'auto-20260105-2.db',
      'auto-20260105.db',
    ])
    expect(autoBackupsToDelete(names, 2)).toEqual(['auto-20260105.db'])
    expect(autoBackupsToDelete(names, 3)).toEqual([])
  })
})

describe('recent workspaces', () => {
  it('prepends the newest entry and dedupes by path', () => {
    expect(addRecentWorkspace([], 'D:\\a')).toEqual(['D:\\a'])
    expect(addRecentWorkspace(['D:\\a', 'D:\\b'], 'D:\\b')).toEqual(['D:\\b', 'D:\\a'])
  })

  it('caps the list at five entries, dropping the oldest', () => {
    const five = ['D:\\1', 'D:\\2', 'D:\\3', 'D:\\4', 'D:\\5']
    expect(addRecentWorkspace(five, 'D:\\6')).toEqual(['D:\\6', 'D:\\1', 'D:\\2', 'D:\\3', 'D:\\4'])
    expect(addRecentWorkspace(['D:\\1', 'D:\\2', 'D:\\3', 'D:\\4', 'D:\\5'], 'D:\\3')).toEqual([
      'D:\\3',
      'D:\\1',
      'D:\\2',
      'D:\\4',
      'D:\\5',
    ])
  })

  it('does not put empty paths in', () => {
    expect(addRecentWorkspace(['D:\\a'], '')).toEqual(['D:\\a'])
    expect(addRecentWorkspace([], '   ')).toEqual([])
  })

  it('normalizes unknown or dirty values from the config file', () => {
    expect(normalizeRecentWorkspaces(null)).toEqual([])
    expect(normalizeRecentWorkspaces(undefined)).toEqual([])
    expect(normalizeRecentWorkspaces('D:\\a')).toEqual([])
    expect(normalizeRecentWorkspaces({ 0: 'D:\\a' })).toEqual([])
    expect(normalizeRecentWorkspaces(['D:\\a', '', 3, 'D:\\a', '  '])).toEqual(['D:\\a'])
    expect(
      normalizeRecentWorkspaces(['D:\\1', 'D:\\2', 'D:\\3', 'D:\\4', 'D:\\5', 'D:\\6']),
    ).toEqual(['D:\\1', 'D:\\2', 'D:\\3', 'D:\\4', 'D:\\5'])
  })
})

describe('snapshot verdicts', () => {
  function probe(partial: Partial<SnapshotProbe>): SnapshotProbe {
    return {
      opened: true,
      hasAppMeta: true,
      schemaVersion: 3,
      workspaceDir: '',
      quickCheck: 'ok',
      ...partial,
    }
  }

  it('reports an unreadable file as corrupt', () => {
    expect(judgeSnapshot(probe({ opened: false }), 3)).toEqual({
      status: 'corrupt',
      reason: '打不开',
    })
  })

  it('reports a failed quick check as corrupt, keeping the original reason', () => {
    expect(judgeSnapshot(probe({ quickCheck: 'database disk image is malformed' }), 3)).toEqual({
      status: 'corrupt',
      reason: 'database disk image is malformed',
    })
  })

  it('reports a library without app_meta as not a workspace', () => {
    expect(judgeSnapshot(probe({ hasAppMeta: false, schemaVersion: 0 }), 3)).toEqual({
      status: 'not-workspace',
    })
  })

  it('rejects a database newer than the app understands', () => {
    expect(judgeSnapshot(probe({ schemaVersion: 9 }), 3)).toEqual({
      status: 'newer',
      schemaVersion: 9,
      supported: 3,
    })
  })

  it('accepts the supported version and anything older', () => {
    expect(judgeSnapshot(probe({ schemaVersion: 3 }), 3)).toEqual({ status: 'ok', schemaVersion: 3 })
    expect(judgeSnapshot(probe({ schemaVersion: 1 }), 3)).toEqual({ status: 'ok', schemaVersion: 1 })
  })

  // 判定顺序写死：打不开 / 检查失败先于「版本更高」，否则一句"请更新应用"会盖住真正的损坏
  it('checks corruption before the version', () => {
    expect(judgeSnapshot(probe({ opened: false, schemaVersion: 9 }), 3).status).toBe('corrupt')
    expect(judgeSnapshot(probe({ quickCheck: 'bad', schemaVersion: 9 }), 3).status).toBe('corrupt')
  })

  it('checks app_meta before the version', () => {
    expect(judgeSnapshot(probe({ hasAppMeta: false, schemaVersion: 9 }), 3).status).toBe(
      'not-workspace',
    )
  })
})

describe('snapshot problem sentences', () => {
  it('writes one sentence per verdict', () => {
    expect(snapshotProblem({ status: 'ok', schemaVersion: 3 })).toBe('')
    expect(snapshotProblem({ status: 'corrupt', reason: '打不开' })).toBe(
      '这份备份已损坏，不能恢复（打不开）',
    )
    expect(snapshotProblem({ status: 'not-workspace' })).toBe(
      '这不是 Transactions 工作空间（缺少 app_meta）',
    )
    expect(snapshotProblem({ status: 'newer', schemaVersion: 9, supported: 3 })).toBe(
      '这份备份的库版本（9）高于本程序支持的（3），请先更新应用',
    )
  })
})

describe('backup directory', () => {
  it('defaults to the "Transactions 备份" folder under Documents', () => {
    expect(defaultBackupDir('D:\\Documents')).toBe('D:\\Documents\\Transactions 备份')
    expect(defaultBackupDir('D:\\Documents\\')).toBe('D:\\Documents\\Transactions 备份')
    expect(resolveBackupDir('', 'D:\\Documents')).toBe(defaultBackupDir('D:\\Documents'))
    expect(resolveBackupDir('   ', 'D:\\Documents')).toBe(defaultBackupDir('D:\\Documents'))
  })

  it('keeps a configured directory as given (trimmed)', () => {
    expect(resolveBackupDir(' E:\\备份 ', 'D:\\Documents')).toBe('E:\\备份')
    expect(resolveBackupDir('E:\\备份', 'D:\\Documents')).toBe('E:\\备份')
  })

  it('keeps the separator when the parent is a filesystem root', () => {
    // 根路径剥掉尾分隔符后只剩空串：补不回来就会拼成一个相对名字
    expect(defaultBackupDir('/')).toBe('/Transactions 备份')
    expect(defaultBackupDir('\\')).toBe('\\Transactions 备份')
    expect(defaultBackupDir('D:\\')).toBe('D:\\Transactions 备份')
  })
})

describe('human readable sizes', () => {
  it('formats bytes, kilobytes and megabytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(812)).toBe('812 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1229)).toBe('1.2 KB')
    expect(formatBytes(3_565_158)).toBe('3.4 MB')
  })

  it('clamps nonsense input to zero', () => {
    expect(formatBytes(-1)).toBe('0 B')
    expect(formatBytes(Number.NaN)).toBe('0 B')
  })
})
