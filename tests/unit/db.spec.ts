import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, currentWorkspace, hasWorkspace, openWorkspace } from '../../electron/db'
import { openDatabase, probeDatabase } from '../../electron/db/driver'
import { MIGRATIONS } from '../../electron/db/migrate'
import { AppError } from '../../shared/errors'

const directories: string[] = []

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-db-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

describe('workspace database', () => {
  it('creates a new workspace from the init schema', () => {
    const directory = temporaryDirectory()
    const workspace = openWorkspace(directory)

    expect(hasWorkspace()).toBe(true)
    expect(currentWorkspace()?.databasePath).toBe(join(directory, 'transactions.db'))

    const meta = workspace.db.prepare('SELECT value FROM app_meta WHERE key = ?').get('schema_version') as
      | { value: string }
      | undefined
    /* 新建的工作空间跑完全部迁移，落库的是**最新**版本（迁移 v2 加了每日复盘模板列）。 */
    expect(meta?.value).toBe(String(MIGRATIONS[MIGRATIONS.length - 1].version))

    workspace.db
      .prepare('INSERT INTO ledger (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('l1', '默认账本', 1, 1)
    const row = workspace.db.prepare('SELECT name FROM ledger WHERE id = ?').get('l1') as
      | { name: string }
      | undefined
    expect(row?.name).toBe('默认账本')
  })

  it('rolls back a failed transaction', () => {
    const workspace = openWorkspace(temporaryDirectory())
    expect(() =>
      workspace.db.transaction(() => {
        workspace.db
          .prepare('INSERT INTO ledger (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run('l1', 'A', 1, 1)
        throw new Error('boom')
      }),
    ).toThrow('boom')

    const count = workspace.db.prepare('SELECT COUNT(*) AS count FROM ledger').get() as {
      count: number
    }
    expect(count.count).toBe(0)
  })

  it('rejects a legacy workspace with a clear message', () => {
    const directory = temporaryDirectory()
    const source = openDatabase(join(directory, 'transactions.db'))
    source.exec('CREATE TABLE tbl_billadm_schema_migration (id TEXT, applied_at INTEGER)')
    source.close()

    let caught: unknown = null
    try {
      openWorkspace(directory)
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(AppError)
    // 数据导入已移除：旧库只能被指出来，不能悄悄打开成一个空工作空间
    expect((caught as AppError).status).toBe(409)
    expect((caught as AppError).message).toContain('旧版工作空间')
  })

  it('rejects a database without app_meta as not a workspace', () => {
    const directory = temporaryDirectory()
    const source = openDatabase(join(directory, 'transactions.db'))
    source.exec('CREATE TABLE something_else (id TEXT)')
    source.close()

    let caught: unknown = null
    try {
      openWorkspace(directory)
    } catch (error) {
      caught = error
    }
    // 快速检查能过、但不是工作空间：这条既有语义要排在快速检查之后、迁移之前
    expect(caught).toBeInstanceOf(AppError)
    expect((caught as AppError).status).toBe(409)
    expect((caught as AppError).message).toContain('不是 Transactions 工作空间')
  })

  it('rejects an existing database with an unknown app_meta version', () => {
    const directory = temporaryDirectory()
    const database = openDatabase(join(directory, 'transactions.db'))
    database.exec("CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    database.exec("INSERT INTO app_meta VALUES ('schema_version', '99')")
    database.close()

    expect(() => openWorkspace(directory)).toThrow(/高于本程序支持/)
  })

  it('rejects an empty path', () => {
    expect(() => openWorkspace('   ')).toThrow(AppError)
  })

  it('keeps a single current workspace when reopening', () => {
    const first = temporaryDirectory()
    const second = temporaryDirectory()
    openWorkspace(first)
    openWorkspace(second)
    expect(currentWorkspace()?.directory).toBe(second)
    closeWorkspace()
    expect(hasWorkspace()).toBe(false)
  })
})

describe('corrupt workspace database', () => {
  /** 把一个刚建好的库的文件头写坏：SQLite 之后任何一句都会报 "file is not a database"。 */
  function corruptHeader(directory: string): { path: string; size: number } {
    openWorkspace(directory)
    closeWorkspace()
    const path = join(directory, 'transactions.db')
    const size = statSync(path).size
    const bytes = readFileSync(path)
    bytes.write('not a database!!', 0, 'ascii')
    writeFileSync(path, bytes)
    return { path, size }
  }

  it('reports the file and points at the restore entry', () => {
    const directory = temporaryDirectory()
    const { path } = corruptHeader(directory)

    let caught: unknown = null
    try {
      openWorkspace(directory)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AppError)
    const error = caught as AppError
    expect(error.message).toContain('已损坏')
    expect(error.message).toContain(path)
    expect(error.message).toContain('从备份恢复')
    expect(hasWorkspace()).toBe(false)
  })

  it('leaves the broken file alone instead of silently creating an empty database', () => {
    const directory = temporaryDirectory()
    const { path, size } = corruptHeader(directory)

    expect(() => openWorkspace(directory)).toThrow(AppError)

    expect(existsSync(path)).toBe(true)
    expect(statSync(path).size).toBe(size)
  })

  it('refuses a missing directory when mustExist is set and does not create it', () => {
    const missing = join(temporaryDirectory(), '已经删除的工作空间')

    let caught: unknown = null
    try {
      openWorkspace(missing, { mustExist: true })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AppError)
    expect((caught as AppError).message).toContain('已经不存在')
    expect((caught as AppError).status).toBe(400)
    expect(existsSync(missing)).toBe(false)
  })

  /**
   * 只破坏一页：文件头完好、`sqlite_master` 也读得到，`PRAGMA quick_check` 才报
   * "database disk image is malformed"。文件头烂掉的那一种由 `corruptHeader` 覆盖。
   */
  function corruptPage(directory: string): string {
    const workspace = openWorkspace(directory)
    workspace.db.exec('CREATE TABLE page_payload (id INTEGER PRIMARY KEY, body BLOB)')
    workspace.db.exec('INSERT INTO page_payload VALUES (1, zeroblob(4000))')
    const row = workspace.db
      .prepare("SELECT rootpage FROM sqlite_master WHERE name = 'page_payload'")
      .get() as { rootpage: number }
    closeWorkspace()

    const path = join(directory, 'transactions.db')
    const bytes = readFileSync(path)
    const pageSize = bytes.readUInt16BE(16) || 4096
    // b-tree 页头第一个字节是页类型；清零后整页解析不了，但别的页（含 sqlite_master）不受影响
    bytes[(row.rootpage - 1) * pageSize] = 0
    writeFileSync(path, bytes)
    return path
  }

  it('reports a page-level corruption the same way instead of letting SQLite speak', () => {
    const directory = temporaryDirectory()
    const path = corruptPage(directory)

    // 前提：能打开、sqlite_master 可读、快速检查报错 —— 坏的是页，不是文件头
    const probe = probeDatabase(path)
    expect(probe.opened).toBe(true)
    expect(probe.hasAppMeta).toBe(true)
    expect(probe.quickCheck).not.toBe('ok')
    // 全量检查同样抓得住（restore 的候选校验走这一条）
    const deep = probeDatabase(path, { deep: true })
    expect(deep.opened).toBe(true)
    expect(deep.quickCheck).not.toBe('ok')

    let caught: unknown = null
    try {
      openWorkspace(directory)
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(AppError)
    expect((caught as AppError).message).toContain('已损坏')
    expect((caught as AppError).message).toContain(path)
    expect((caught as AppError).message).toContain('从备份恢复')
    expect(hasWorkspace()).toBe(false)
  })

  /** 破坏第 1 页的 b-tree 页头（文件头之后 100 字节）：能打开，但 sqlite_master 本身读不了。 */
  function corruptSchemaPage(directory: string): string {
    openWorkspace(directory)
    closeWorkspace()
    const path = join(directory, 'transactions.db')
    const bytes = readFileSync(path)
    bytes[100] = 0
    writeFileSync(path, bytes)
    return path
  }

  it('never lets the raw SQLite error escape when sqlite_master itself is unreadable', () => {
    const directory = temporaryDirectory()
    const path = corruptSchemaPage(directory)

    let caught: unknown = null
    try {
      openWorkspace(directory)
    } catch (error) {
      caught = error
    }

    // 旧顺序让 tableExists() 的 SQLite 原文直接冒到界面；这里必须是「坏了，去恢复」
    expect(caught).toBeInstanceOf(AppError)
    expect((caught as AppError).message).toContain('已损坏')
    expect((caught as AppError).message).toContain(path)
    expect((caught as AppError).message).toContain('从备份恢复')
    expect(hasWorkspace()).toBe(false)
  })
})

describe('workspace file layout', () => {
  it('leaves a readable database file on disk', () => {
    const directory = temporaryDirectory()
    openWorkspace(directory)
    writeFileSync(join(directory, 'marker.txt'), 'ok')
    expect(join(directory, 'transactions.db')).toMatch(/transactions\.db$/)
  })
})
