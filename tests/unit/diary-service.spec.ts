import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import * as diaryDao from '../../electron/db/dao/diary'
import type { Db } from '../../electron/db/driver'
import * as diary from '../../electron/services/diary'
import type { DiaryEntry } from '../../shared/domain/models'
import { AppError } from '../../shared/errors'

const directories: string[] = []

function tempDirectory(tag: string): string {
  const directory = mkdtempSync(join(tmpdir(), `tr-diary-${tag}-`))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function makeEntry(
  id: string,
  ledgerId: string,
  date: string,
  content: string,
  mood: string,
): DiaryEntry {
  return {
    id,
    date,
    content,
    wordCount: Array.from(content).length,
    mood,
    createdAt: 0,
    updatedAt: 0,
    ledgerId,
  }
}

function rowCount(db: Db): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM diary_entry').get() as { count: number }
  return row.count
}

describe('diary dao', () => {
  it('upsert by date keeps id and updated_at', () => {
    const workspace = openWorkspace(tempDirectory('dao-upsert'))
    const db = workspace.db

    diaryDao.upsert(db, makeEntry('d1', 'l1', '2026-01-02', '第一天', '开心'), 1_700_000_000)
    const first = diaryDao.queryByDate(db, 'l1', '2026-01-02')

    // 既有测试用 1.1 秒的 sleep 制造时间差；这里显式传入 now，行为等价且不拖慢用例
    diaryDao.upsert(db, makeEntry('d2', 'l1', '2026-01-02', '第一天改', '平静'), 1_700_000_100)
    const second = diaryDao.queryByDate(db, 'l1', '2026-01-02')

    expect(second.id, '按日期冲突时保留原 id').toBe('d1')
    expect(second.content).toBe('第一天改')
    expect(second.mood).toBe('平静')
    expect(second.ledgerId).toBe('l1')
    expect(second.createdAt).toBe(first.createdAt)
    // 冲突时更新的列不含 updated_at：更新时间保持首次写入的值
    expect(second.updatedAt).toBe(first.updatedAt)
    expect(rowCount(db)).toBe(1)
  })

  it('list dates is desc and keyword uses instr', () => {
    const workspace = openWorkspace(tempDirectory('dao-list'))
    const db = workspace.db
    diaryDao.upsert(db, makeEntry('d1', 'l1', '2026-01-01', '今天读书', ''))
    diaryDao.upsert(db, makeEntry('d2', 'l1', '2025-12-31', '今天跑步 100%', ''))
    diaryDao.upsert(db, makeEntry('d3', 'l1', '2026-02-01', '写代码', '充实'))
    // 别的账本：完全不可见
    diaryDao.upsert(db, makeEntry('d4', 'l2', '2026-03-01', '今天读书', '开心'))

    const dates = diaryDao.listDates(db, 'l1')
    expect(dates.map((item) => item.date)).toEqual(['2026-02-01', '2026-01-01', '2025-12-31'])
    // 只选三列：其余字段保持零值
    expect(dates[0].content).toBe('')
    expect(dates[0].id).toBe('')
    expect(dates[2].mood).toBe('')
    expect(dates[0].mood).toBe('充实')

    expect(diaryDao.listDatesByKeyword(db, 'l1', '今天')).toHaveLength(2)
    // `%` 不当通配符（LIKE 会误命中全部）
    expect(diaryDao.listDatesByKeyword(db, 'l1', '%')).toHaveLength(1)

    const all = diaryDao.listByLedger(db, 'l1')
    expect(all.map((item) => item.date)).toEqual(['2025-12-31', '2026-01-01', '2026-02-01'])
    expect(all.every((item) => item.ledgerId === 'l1')).toBe(true)

    // 另一个账本只看得见自己那篇
    const other = diaryDao.listByLedger(db, 'l2')
    expect(other).toHaveLength(1)
    expect(other[0].date).toBe('2026-03-01')
  })

  it('same date in two ledgers creates two rows', () => {
    const workspace = openWorkspace(tempDirectory('dao-ledger'))
    const db = workspace.db

    diaryDao.upsert(db, makeEntry('d1', 'l1', '2026-01-01', '账本一的正文', ''))
    diaryDao.upsert(db, makeEntry('d2', 'l2', '2026-01-01', '账本二的正文', ''))

    expect(rowCount(db), '不同账本的同一天必须各存一篇').toBe(2)
    expect(diaryDao.queryByDate(db, 'l1', '2026-01-01').content).toBe('账本一的正文')
    expect(diaryDao.queryByDate(db, 'l2', '2026-01-01').content).toBe('账本二的正文')
  })

  it('delete and missing lookup are scoped by ledger', () => {
    const workspace = openWorkspace(tempDirectory('dao-delete'))
    const db = workspace.db
    diaryDao.upsert(db, makeEntry('d1', 'l1', '2026-01-01', '内容', ''))
    diaryDao.upsert(db, makeEntry('d2', 'l2', '2026-01-01', '别人的内容', ''))

    // 删别的账本的同日期：no-op
    diaryDao.deleteByDate(db, 'l3', '2026-01-01')
    expect(diaryDao.listByLedger(db, 'l2')).toHaveLength(1)

    diaryDao.deleteByDate(db, 'l1', '2026-01-01')
    diaryDao.deleteByDate(db, 'l1', '2026-01-01') // 幂等

    expect(() => diaryDao.queryByDate(db, 'l1', '2026-01-01')).toThrow('record not found')
    expect(diaryDao.listByLedger(db, 'l2')).toHaveLength(1)
  })
})

describe('diary service', () => {
  it('upsert counts characters and returns the entry', () => {
    const workspace = openWorkspace(tempDirectory('upsert'))
    const entry = diary.upsert(workspace.db, 'l1', '2026-01-01', '中文abc', '开心')

    expect(entry.wordCount, '字数按 Unicode 字符数').toBe(5)
    expect(entry.mood).toBe('开心')
    expect(entry.id.length).toBe(36)

    const loaded = diary.getByDate(workspace.db, 'l1', '2026-01-01')
    expect(loaded.content).toBe('中文abc')
    expect(loaded.wordCount).toBe(5)

    // 覆盖保存：内容更新、id 保留
    diary.upsert(workspace.db, 'l1', '2026-01-01', '改了', '')
    const reloaded = diary.getByDate(workspace.db, 'l1', '2026-01-01')
    expect(reloaded.content).toBe('改了')
    expect(reloaded.wordCount).toBe(2)
    expect(reloaded.id).toBe(loaded.id)

    const dates = diary.listDates(workspace.db, 'l1')
    expect(dates).toHaveLength(1)
    expect(dates[0].wordCount).toBe(2)
  })

  it('missing entry reports an error', () => {
    const workspace = openWorkspace(tempDirectory('missing'))
    let caught: unknown
    try {
      diary.getByDate(workspace.db, 'l1', '2000-01-01')
    } catch (error) {
      caught = error
    }
    expect(caught).toBeInstanceOf(AppError)
    expect((caught as AppError).message).toBe('record not found')
  })

  it('scan finds only txt files recursively and sorts', () => {
    const directory = tempDirectory('scan')
    const nested = join(directory, 'sub')
    mkdirSync(nested, { recursive: true })
    writeFileSync(join(nested, '2026-01-01.txt'), 'a')
    writeFileSync(join(directory, '2026-01-02.txt'), 'b')
    // 下面这些都不该被收进来
    writeFileSync(join(directory, '2026-01-03.md'), 'c') // 只支持 .txt
    writeFileSync(join(directory, '2026-01-04.markdown'), 'd') // 扩展名不支持
    writeFileSync(join(directory, '2026-02-30.txt'), 'e') // 不存在的日期
    writeFileSync(join(directory, 'note.txt'), 'f') // 无日期
    writeFileSync(join(directory, 'x2026-01-05.txt'), 'g') // 前缀多余
    writeFileSync(join(directory, '2026-01-06'), 'h') // 没有扩展名

    const response = diary.scanDirectory(directory)
    expect(response.files.map((file) => file.date)).toEqual(['2026-01-01', '2026-01-02'])
    expect(response.files[1].path.endsWith('2026-01-02.txt')).toBe(true)

    // 目录不存在时报错
    expect(() => diary.scanDirectory(join(directory, 'nope'))).toThrow(/^扫描目录失败:/)
  })

  it('import decodes utf8 utf16 and gbk', () => {
    const workspace = openWorkspace(tempDirectory('import'))
    const files = tempDirectory('import-files')
    const utf8Path = join(files, '2026-01-01.txt')
    const utf16Path = join(files, '2026-01-02.txt')
    const gbkPath = join(files, '2026-01-03.txt')
    const brokenPath = join(files, '2026-01-04.txt')

    writeFileSync(utf8Path, Buffer.from('中文内容', 'utf8'))
    // UTF-16LE + BOM
    writeFileSync(
      utf16Path,
      Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('中文内容', 'utf16le')]),
    )
    // GBK：中文内容 = D6 D0 CE C4 C4 DA C8 DD
    writeFileSync(gbkPath, Buffer.from([0xd6, 0xd0, 0xce, 0xc4, 0xc4, 0xda, 0xc8, 0xdd]))
    // 非法 UTF-8（0xFF 之外的孤立字节）→ 替换为 ?
    writeFileSync(brokenPath, Buffer.from([0x61, 0xff, 0x62]))

    for (const [path, date] of [
      [utf8Path, '2026-01-01'],
      [utf16Path, '2026-01-02'],
      [gbkPath, '2026-01-03'],
    ] as const) {
      const entry = diary.importFile(workspace.db, 'l1', path, date)
      expect(entry.content, `${path} 解码失败`).toBe('中文内容')
      expect(entry.wordCount).toBe(4)
      expect(entry.mood).toBe('')
    }

    const broken = diary.importFile(workspace.db, 'l1', brokenPath, '2026-01-04')
    expect(broken.content, '非法字节应被替换').toContain('?')
  })

  // 导入侧也要挡非 `.txt`：扫描只看 `.txt`，导入却是"给什么读什么"就会变成两套口径。
  it('import rejects non txt files', () => {
    const workspace = openWorkspace(tempDirectory('import-reject'))
    const files = tempDirectory('import-reject-files')
    const mdPath = join(files, '2026-01-01.md')
    writeFileSync(mdPath, '正文')

    expect(() => diary.importFile(workspace.db, 'l1', mdPath, '2026-01-01')).toThrow(
      'YYYY-MM-DD.txt',
    )

    // 文件名里的日期非法也拦（例如 2026-02-30）
    const badDate = join(files, '2026-02-30.txt')
    writeFileSync(badDate, '正文')
    expect(() => diary.importFile(workspace.db, 'l1', badDate, '2026-02-30')).toThrow(
      'YYYY-MM-DD.txt',
    )
  })

  it('export filters by year and month', () => {
    const workspace = openWorkspace(tempDirectory('export'))
    diary.upsert(workspace.db, 'l1', '2025-12-31', '去年', '')
    diary.upsert(workspace.db, 'l1', '2026-01-01', '一月', '')
    diary.upsert(workspace.db, 'l1', '2026-02-01', '二月', '')

    const out = tempDirectory('export-out')
    // 全部导出
    const all = diary.exportToDirectory(workspace.db, 'l1', out, 0, 0)
    expect(all.total).toBe(3)
    expect(all.success).toBe(3)
    expect(all.failed).toEqual([])
    expect(existsSync(join(out, '2026-01-01.txt'))).toBe(true)
    expect(readFileSync(join(out, '2026-02-01.txt'), 'utf8')).toBe('二月')

    // 按年
    const yearOut = tempDirectory('export-year')
    const byYear = diary.exportToDirectory(workspace.db, 'l1', yearOut, 2026, 0)
    expect(byYear.total).toBe(2)
    expect(existsSync(join(yearOut, '2025-12-31.txt'))).toBe(false)

    // 按年月
    const monthOut = tempDirectory('export-month')
    const byMonth = diary.exportToDirectory(workspace.db, 'l1', monthOut, 2026, 2)
    expect(byMonth.total).toBe(1)
    expect(existsSync(join(monthOut, '2026-02-01.txt'))).toBe(true)
    expect(existsSync(join(monthOut, '2026-01-01.txt'))).toBe(false)

    // 目录不存在时自动创建
    const nested = join(out, 'a', 'b')
    const inNested = diary.exportToDirectory(workspace.db, 'l1', nested, 2026, 1)
    expect(inNested.success).toBe(1)
    expect(existsSync(join(nested, '2026-01-01.txt'))).toBe(true)
  })

  it('date validation is strict', () => {
    expect(diary.isValidDiaryDate('2026-01-01')).toBe(true)
    expect(diary.isValidDiaryDate('2024-02-29'), '闰年 2 月 29 日合法').toBe(true)
    expect(diary.isValidDiaryDate('2026-02-29'), '平年 2 月 29 日非法').toBe(false)
    expect(diary.isValidDiaryDate('2026-13-01')).toBe(false)
    expect(diary.isValidDiaryDate('2026-00-10')).toBe(false)
    expect(diary.isValidDiaryDate('2026-01-00')).toBe(false)
    expect(diary.isValidDiaryDate('2026-1-01'), '必须零填充').toBe(false)
    expect(diary.isValidDiaryDate('26-01-01')).toBe(false)
    expect(diary.isValidDiaryDate('2026/01/01')).toBe(false)
    expect(diary.parseDiaryYearMonth('2026-03-09')).toEqual([2026, 3])
    expect(diary.parseDiaryYearMonth('2026-03')).toBeNull()
  })

  // 用户真实流程：A 工作空间导出 → 扫描目录 → 导入 B 工作空间，正文必须逐字节还原。
  it('export then import round trips content', () => {
    const source = openWorkspace(tempDirectory('roundtrip-src'))
    const contents = [
      ['2026-01-01', '第一行\n第二行'],
      ['2026-01-02', '带 emoji 🙂 与制表符\t结束'],
      ['2026-01-03', '无结尾换行'],
    ] as const
    for (const [date, content] of contents) {
      diary.upsert(source.db, 'l1', date, content, '开心')
    }

    const out = tempDirectory('roundtrip-out')
    const result = diary.exportToDirectory(source.db, 'l1', out, 0, 0)
    expect([result.total, result.success]).toEqual([3, 3])

    // 切到目标工作空间（openWorkspace 会先关掉源库）
    const target = openWorkspace(tempDirectory('roundtrip-dst'))
    const scan = diary.scanDirectory(out)
    expect(scan.files).toHaveLength(3)
    expect(scan.files.map((file) => file.date)).toEqual([
      '2026-01-01',
      '2026-01-02',
      '2026-01-03',
    ])

    for (const file of scan.files) {
      const entry = diary.importFile(target.db, 'l1', file.path, file.date)
      expect(entry.date).toBe(file.date)
      // 导出格式是纯文本（`.txt`），只有正文；mood 不随文件走
      expect(entry.mood).toBe('')
    }

    for (const [date, content] of contents) {
      const loaded = diary.getByDate(target.db, 'l1', date)
      expect(loaded.content, `${date} 正文未逐字节还原`).toBe(content)
      expect(loaded.wordCount).toBe(Array.from(content).length)
    }
  })

  it('delete is idempotent', () => {
    const workspace = openWorkspace(tempDirectory('delete'))
    diary.upsert(workspace.db, 'l1', '2026-01-01', '内容', '')
    diary.deleteByDate(workspace.db, 'l1', '2026-01-01')
    diary.deleteByDate(workspace.db, 'l1', '2026-01-01')
    expect(diary.listDates(workspace.db, 'l1')).toHaveLength(0)
  })

  // 同一天在两个账本里各存一篇：互不覆盖、互不可见（复合唯一键的行为）。
  it('same date in two ledgers is independent', () => {
    const workspace = openWorkspace(tempDirectory('two-ledgers'))
    const other = 'l2'

    diary.upsert(workspace.db, 'l1', '2026-01-01', '账本一的正文', '开心')
    diary.upsert(workspace.db, other, '2026-01-01', '账本二的正文', '平静')

    expect(diary.getByDate(workspace.db, 'l1', '2026-01-01').content).toBe('账本一的正文')
    expect(diary.getByDate(workspace.db, other, '2026-01-01').content).toBe('账本二的正文')
    expect(diary.listDates(workspace.db, 'l1')).toHaveLength(1)
    expect(diary.listDates(workspace.db, other)).toHaveLength(1)

    // 删掉账本一那篇，账本二不受影响
    diary.deleteByDate(workspace.db, 'l1', '2026-01-01')
    expect(diary.listDates(workspace.db, 'l1')).toHaveLength(0)
    expect(diary.listDates(workspace.db, other)).toHaveLength(1)

    // 保存返回的条目带着账本 id
    const saved = diary.upsert(workspace.db, other, '2026-01-02', '第二天', '')
    expect(saved.ledgerId).toBe(other)
  })

  // 导出只导指定账本（与导入对称）：另一个账本的日记绝不落盘。
  it('export only covers the given ledger', () => {
    const workspace = openWorkspace(tempDirectory('export-ledger'))
    diary.upsert(workspace.db, 'l1', '2026-01-01', '我的日记', '')
    diary.upsert(workspace.db, 'l2', '2026-01-02', '别人的日记', '')

    const out = tempDirectory('export-ledger-out')
    const result = diary.exportToDirectory(workspace.db, 'l1', out, 0, 0)
    expect([result.total, result.success]).toEqual([1, 1])
    expect(existsSync(join(out, '2026-01-01.txt'))).toBe(true)
    expect(existsSync(join(out, '2026-01-02.txt')), '别的账本的日记不得被导出').toBe(false)
  })
})
