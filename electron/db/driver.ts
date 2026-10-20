import { DatabaseSync } from 'node:sqlite'

/**
 * 数据库驱动的唯一入口。
 *
 * 目前用 Node 内置的 `node:sqlite`（Electron 与系统 Node 都自带，免原生模块/ABI 重建）。
 * 若 M0 的打包态验证不通过，只需要替换本文件为 better-sqlite3 的实现，上层不感知。
 */
export class Db {
  private readonly db: DatabaseSync

  constructor(path: string) {
    this.db = new DatabaseSync(path)
    this.db.exec('PRAGMA journal_mode = WAL')
    this.db.exec('PRAGMA synchronous = NORMAL')
    this.db.exec('PRAGMA busy_timeout = 5000')
    this.db.exec('PRAGMA foreign_keys = OFF')
  }

  exec(sql: string): void {
    this.db.exec(sql)
  }

  prepare(sql: string) {
    return this.db.prepare(sql)
  }

  transaction<T>(fn: () => T): T {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const result = fn()
      this.db.exec('COMMIT')
      return result
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  close(): void {
    this.db.close()
  }
}

export function openDatabase(path: string): Db {
  return new Db(path)
}
