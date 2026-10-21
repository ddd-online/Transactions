import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { ANT_PALETTES } from '../../src/theme/antd-theme'

function block(source: string, selector: string): string {
  const start = source.indexOf(selector)
  if (start < 0) throw new Error(`missing ${selector}`)
  const open = source.indexOf('{', start)
  let depth = 0
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1
    if (source[index] === '}') {
      depth -= 1
      if (depth === 0) return source.slice(open + 1, index)
    }
  }
  throw new Error(`unclosed ${selector}`)
}

function token(css: string, name: string): string {
  const match = css.match(new RegExp(`--transactions-${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`missing token ${name}`)
  return match[1].trim()
}

const source = readFileSync(resolve(__dirname, '../../src/styles/tokens.css'), 'utf8')
const light = block(source, ':root')
const dark = block(source, "[data-theme='dark']")

describe('AntD theme bridge', () => {
  it('keeps light surface colors in sync with design tokens', () => {
    expect(token(light, 'color-primary')).toBe(ANT_PALETTES.light.primary)
    expect(token(light, 'color-text-major')).toBe(ANT_PALETTES.light.text)
    expect(token(light, 'color-text-secondary')).toBe(ANT_PALETTES.light.textSecondary)
    expect(token(light, 'color-bg-base')).toBe(ANT_PALETTES.light.bgBase)
    expect(token(light, 'color-major-background')).toBe(ANT_PALETTES.light.bgContainer)
    expect(token(light, 'color-border-l1')).toBe(ANT_PALETTES.light.border)
  })

  it('keeps dark surface colors in sync with design tokens', () => {
    expect(token(dark, 'color-primary')).toBe(ANT_PALETTES.dark.primary)
    expect(token(dark, 'color-text-major')).toBe(ANT_PALETTES.dark.text)
    expect(token(dark, 'color-text-secondary')).toBe(ANT_PALETTES.dark.textSecondary)
    expect(token(dark, 'color-bg-base')).toBe(ANT_PALETTES.dark.bgBase)
    expect(token(dark, 'color-major-background')).toBe(ANT_PALETTES.dark.bgContainer)
    expect(token(dark, 'color-border-l2')).toBe(ANT_PALETTES.dark.border)
  })
})
