/**
 * 把合成种子工作空间的 SQLite 文件转成可提交的 SQL 文本。
 *
 * 读 `seed-ws/transactions.db`，写出表结构 + 全部 INSERT。
 * 生成的文件只含合成数据，用于导入器/服务层回归。
 *
 * 用法：
 *   node scripts/generate-compat-seed-sql.mjs <seed.db> <out.sql>
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { DatabaseSync } from 'node:sqlite'

const [databasePath, outputPath] = process.argv.slice(2)
if (!databasePath || !outputPath) {
  console.error('用法: node scripts/generate-compat-seed-sql.mjs <seed.db> <out.sql>')
  process.exit(1)
}

const db = new DatabaseSync(databasePath, { readOnly: true })

function quoteIdentifier(name) {
  return `"${name.replace(/"/g, '""')}"`
}

function quoteValue(value) {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`非法数字: ${value}`)
    return String(value)
  }
  if (typeof value === 'bigint') return value.toString()
  if (typeof value === 'string') return `'${value.replace(/'/g, "''")}'`
  if (value instanceof Uint8Array) {
    return `X'${Buffer.from(value).toString('hex')}'`
  }
  throw new Error(`不支持的 SQLite 值类型: ${typeof value}`)
}

const objects = db
  .prepare(
    "SELECT type, name, sql FROM sqlite_master WHERE type IN ('table', 'index') AND sql IS NOT NULL ORDER BY CASE type WHEN 'table' THEN 0 ELSE 1 END, rowid",
  )
  .all()

const lines = []
lines.push('-- 源格式 种子工作空间的 SQL dump（合成数据，不含真实个人数据）。')
lines.push('PRAGMA foreign_keys = OFF;')
lines.push('BEGIN TRANSACTION;')

for (const object of objects) {
  lines.push(`${object.sql};`)
  if (object.type !== 'table') continue
  const table = object.name
  const rows = db.prepare(`SELECT * FROM ${quoteIdentifier(table)}`).all()
  if (rows.length === 0) continue
  const columns = Object.keys(rows[0])
  const columnList = columns.map(quoteIdentifier).join(', ')
  for (const row of rows) {
    const values = columns.map((column) => quoteValue(row[column])).join(', ')
    lines.push(`INSERT INTO ${quoteIdentifier(table)} (${columnList}) VALUES (${values});`)
  }
}

lines.push('COMMIT;')
db.close()

writeFileSync(outputPath, `${lines.join('\n')}\n`, 'utf8')
const bytes = readFileSync(outputPath)
console.log(`wrote ${outputPath} (${bytes.length} bytes, ${objects.length} schema objects)`)
