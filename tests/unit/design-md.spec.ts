/**
 * DESIGN.md 的机器可读那一份，必须和 `tokens.css` 说同一件事。
 *
 * frontmatter 里的 `colors` 是这套设计系统对外（检测器、编辑器、后来的 agent）的结构化契约。
 * 它漂过一次：九色相色板换掉之后，正文表格改了、frontmatter 还留着被淘汰的三族色板
 * （`#c36d64` / `#509c67` …，其中就有被明确否决的两个近色绿）。文档和实现对不上时，
 * 先被相信的往往是结构化的那一份 —— 所以这里逐个键对一遍，而不是只挑几个眼熟的。
 *
 * 只比浅色：frontmatter 的 `colors` 按约定只写浅色，深色在 `tokens.css` 的第二块里。
 */

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { token, tokensCss } from './css-tokens'

const design = readFileSync(resolve(__dirname, '../../DESIGN.md'), 'utf8')

/** frontmatter → `--transactions-<token>`。账本那八个没有 `color-` 前缀，名字直接对上。 */
const TOKENS: Record<string, string> = {
  primary: 'color-primary',
  'primary-light': 'color-primary-light',
  'primary-active': 'color-primary-active',
  'primary-tint': 'color-primary-tint',
  canvas: 'color-bg-base',
  surface: 'color-major-background',
  'surface-soft': 'color-minor-background',
  'text-major': 'color-text-major',
  'text-secondary': 'color-text-secondary',
  'text-tertiary': 'color-text-tertiary',
  'text-disabled': 'color-text-disabled',
  'text-inverse': 'color-text-inverse',
  border: 'color-border-l1',
  'border-l2': 'color-border-l2',
  'border-l3': 'color-border-l3',
  divider: 'color-divider',
  'hover-bg': 'color-hover-bg',
  'active-bg': 'color-active-bg',
  income: 'color-income',
  expense: 'color-expense',
  transfer: 'color-transfer',
  outlier: 'color-outlier',
  'income-tint': 'color-income-tint',
  'expense-tint': 'color-expense-tint',
  'transfer-tint': 'color-transfer-tint',
  'outlier-tint': 'color-outlier-tint',
  'ledger-forest': 'ledger-forest',
  'ledger-amber': 'ledger-amber',
  'ledger-slate-blue': 'ledger-slate-blue',
  'ledger-vermillion': 'ledger-vermillion',
  'ledger-warm-brown': 'ledger-warm-brown',
  'ledger-ochre': 'ledger-ochre',
  'ledger-moss': 'ledger-moss',
  'ledger-camel': 'ledger-camel',
  'series-other': 'color-series-other',
  ...Object.fromEntries(
    Array.from({ length: 9 }, (_, index) => [`series-${index + 1}`, `color-series-${index + 1}`]),
  ),
}

/** 取 frontmatter 里 `colors:` 下的键值对。 */
function frontmatterColors(source: string): Record<string, string> {
  const frontmatter = source.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatter) throw new Error('DESIGN.md has no frontmatter')
  const colors = frontmatter[1].match(/^colors:\n([\s\S]*?)(?=\n\S)/m)
  if (!colors) throw new Error('frontmatter has no colors block')
  const entries = [...colors[1].matchAll(/^\s{2}([a-z0-9-]+):\s*"([^"]+)"\s*$/gm)]
  return Object.fromEntries(entries.map(([, key, value]) => [key, value]))
}

/** 空白和大小写都不算差别（`rgba(15, 17, 21, 0.06)` 与 `rgba(15,17,21,0.06)` 是同一个值）。 */
function normalise(value: string): string {
  return value.replace(/\s+/g, '').toLowerCase()
}

const documented = frontmatterColors(design)
const light = tokensCss

describe('DESIGN.md frontmatter', () => {
  it('every documented colour has a token behind it', () => {
    const unmapped = Object.keys(documented).filter((key) => !(key in TOKENS))
    expect(unmapped).toEqual([])
  })

  it.each(Object.keys(TOKENS))('%s matches tokens.css', (key) => {
    expect(documented[key], `${key} 缺失`).toBeDefined()
    expect(normalise(documented[key])).toBe(normalise(token(light, TOKENS[key])))
  })
})
