import type { Db } from './driver'

/**
 * `app_meta` 是整库级的键值表：`schema_version` 这类单例行，以及「某个账本已经初始化过
 * 预设图表」这种一次性标记都放在这里。
 *
 * 表本身由第一条迁移建立；调用方都在工作空间打开之后，所以这里直接读写。
 */
export function readMeta(db: Db, key: string): string | null {
  const row = db.prepare('SELECT value FROM app_meta WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function writeMeta(db: Db, key: string, value: string): void {
  db.prepare(
    'INSERT INTO app_meta(key, value) VALUES (?, ?) ' +
      'ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, value)
}
