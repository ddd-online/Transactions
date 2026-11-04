/**
 * 文字令牌的对比度下限。
 *
 * 色板有 `series-colors.spec.ts` 拿色相环和 ΔE 盯着，文字色此前一条判据都没有 ——
 * 于是三级灰在浅色下停在 3.55:1（AA 要 4.5:1），而它正用在日期选择器的星期行、
 * 图表提示标签、时间戳和计数上。这套测试把「哪些令牌当正文读」写成清单，逐主题、
 * 逐底色算一遍：以后谁调暗一档字色，这里先红。
 *
 * 判据与取舍写在 DESIGN.md「Neutral」；取值在 src/styles/tokens.css。
 */

import { describe, expect, it } from 'vitest'

import { ANT_PALETTES } from '../../src/theme/antd-theme'
import { block, token, tokensCss } from './css-tokens'

const LIGHT = block(tokensCss, ':root')
const DARK = block(tokensCss, "[data-theme='dark']")
const SYSTEM = block(tokensCss, 'html:not([data-theme])')

/** 当正文读的三档字色。`text-disabled` 不在其中：非活动控件 WCAG 不要求达标。 */
const READABLE = ['color-text-major', 'color-text-secondary', 'color-text-tertiary']

/** 这几档字色会落在哪些底上。全都写出来，判据才不会被「反正在白纸上还行」糊过去。 */
const SURFACES = [
  'color-bg-base',
  'color-major-background',
  'color-card-surface',
  'color-minor-background',
  'color-elevated',
]

// ---------------------------------------------------------------- 颜色计算

function channels(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  const at = (offset: number): number => Number.parseInt(value.slice(offset, offset + 2), 16) / 255
  return [at(0), at(2), at(4)]
}

function linear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
}

function luminance(hex: string): number {
  const [r, g, b] = channels(hex).map(linear)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

const AA = 4.5

describe('text contrast', () => {
  it.each([
    ['light', LIGHT],
    ['dark', DARK],
    ['system-dark', SYSTEM],
  ])('%s: 当正文读的三档字色在每种底色上都过 AA', (_theme, css) => {
    const failures: string[] = []
    for (const text of READABLE) {
      for (const surface of SURFACES) {
        const ratio = contrast(token(css, text), token(css, surface))
        if (ratio < AA) failures.push(`${text} on ${surface} = ${ratio.toFixed(2)}:1`)
      }
    }
    expect(failures).toEqual([])
  })

  it('系统深色块与 [data-theme=dark] 说的是同一件事', () => {
    for (const name of [...READABLE, ...SURFACES]) {
      expect(token(SYSTEM, name)).toBe(token(DARK, name))
    }
  })

  it('实色按钮面上的字过 AA', () => {
    for (const mode of ['light', 'dark'] as const) {
      const palette = ANT_PALETTES[mode]
      // 主按钮压白字；危险按钮的字色是 `dangerInk`（深色下危险底是亮红，白字只有 2.8:1）。
      const faces: Array<[string, string, string]> = [
        ['primary', palette.primary, '#ffffff'],
        ['danger', palette.error, palette.dangerInk],
      ]
      for (const [name, background, ink] of faces) {
        const ratio = contrast(ink, background)
        expect(ratio, `${mode}: ${name} 面 = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
      }
    }
  })

  it('三级灰比二级灰淡，但淡得可控 —— 层级靠字号，不靠掉出 AA', () => {
    const base = (name: string): number => contrast(token(LIGHT, name), token(LIGHT, 'color-major-background'))
    const secondary = base('color-text-secondary')
    const tertiary = base('color-text-tertiary')
    // 仍是一眼看得出的两档：三级灰至少比二级灰淡 5%。
    expect(tertiary).toBeLessThan(secondary * 0.95)
    // 但差距不许大到靠「不合格」来拉开。
    expect(secondary - tertiary).toBeLessThan(1.2)
  })
})
