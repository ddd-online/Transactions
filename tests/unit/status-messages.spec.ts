/**
 * 状态消息必须**说得出口**。
 *
 * 仓库里 31 处错误段落曾经只有「视觉上出现了」这一半：读屏用户在表单里输错、
 * 提交、界面插进一段红字 —— 而他们那边一片安静。这条测试扫源码，要求每个错误
 * 段落都带 live region（`role="alert"` 或 `aria-live`）。
 *
 * 为什么扫源码而不是渲染：错误段落在十几张页面里，只有一条规则要守；源码扫描
 * 便宜、无 DOM 依赖，且新加一处忘记带 role 时会立刻红。
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const ROOT = resolve(__dirname, '../..')
const SRC = join(ROOT, 'src')

function sourceFiles(directory: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) found.push(...sourceFiles(path))
    else if (entry.endsWith('.tsx')) found.push(path)
  }
  return found
}

/** 一个 JSX 开始标签（`<p …>`），跨行也算：`[^>]` 不吃 `>`，但吃换行。 */
const TAG = /<p\b[^>]*>/g

interface Finding {
  file: string
  tag: string
}

const files = sourceFiles(SRC)

describe('status messages', () => {
  it('每个错误段落都带 live region', () => {
    const failures: Finding[] = []
    for (const file of files) {
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(TAG)) {
        const tag = match[0]
        if (!/className="[^"]*error/.test(tag)) continue
        const announced = /role="alert"/.test(tag) || /aria-live=/.test(tag)
        if (!announced) failures.push({ file: relative(ROOT, file), tag: tag.replace(/\s+/g, ' ') })
      }
    }
    expect(failures).toEqual([])
  })

  it('轻提示走 role=status，打断式失败走 role=alert', () => {
    const toast = readFileSync(join(SRC, 'components', 'toast.tsx'), 'utf8')
    expect(toast).toMatch(/role="status"/)

    const boundary = readFileSync(join(SRC, 'components', 'page-boundary.tsx'), 'utf8')
    expect(boundary).toMatch(/role="alert"/)
  })

  it('字段级错误与出错的那个框建立关系（示范处）', () => {
    const stock = readFileSync(join(SRC, 'pages', 'stock.tsx'), 'utf8')
    // 金额弹窗：错误段落有 id、输入框指回去，并且标了 aria-invalid
    expect(stock).toContain('id="stock-amount-error"')
    expect(stock).toContain("aria-describedby={accountError ? 'stock-amount-error' : undefined}")
    expect(stock).toContain('aria-invalid={Boolean(accountError)}')
  })

  /* 字段级关联的完整清单：每个「单一字段 + 一条错误」的表单都要
   * ① 错误段落带 id ② 输入框带 aria-invalid ③ aria-describedby 指回那个 id。
   * 只做一处、其余靠自觉，就是上一轮被抓到的「只补了一个地方」。 */
  const FIELD_ERRORS: Array<{ file: string; id: string; message: string }> = [
    { file: 'stock.tsx', id: 'stock-amount-error', message: 'accountError' },
    { file: 'todo.tsx', id: 'todo-card-error', message: 'cardError' },
    { file: 'todo.tsx', id: 'todo-item-error', message: 'itemError' },
    { file: 'stock-lesson-dialog.tsx', id: 'stock-lesson-error', message: 'error' },
    { file: 'category-tag.tsx', id: 'category-error', message: 'categoryError' },
    { file: 'category-tag.tsx', id: 'tag-error', message: 'tagError' },
    { file: 'charts.tsx', id: 'chart-create-error', message: 'createError' },
    { file: 'charts.tsx', id: 'chart-rename-error', message: 'renameError' },
  ]

  it.each(FIELD_ERRORS)('$id 与输入框双向关联', ({ file, id, message }) => {
    const source = readFileSync(join(SRC, 'pages', file), 'utf8')
    expect(source, `${file} 缺错误段 id=${id}`).toContain(`id="${id}"`)
    expect(source, `${file} 缺 aria-invalid`).toContain(`aria-invalid={Boolean(${message})}`)
    expect(source, `${file} 缺 aria-describedby → ${id}`).toContain(
      `aria-describedby={${message} ? '${id}' : undefined}`,
    )
  })
})
