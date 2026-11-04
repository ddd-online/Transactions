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

  /* 实色按钮的三种状态都要过 —— 只测静止会漏掉正好在指针底下那一刻：
   * AntD 的默认算法把悬停往亮里推（#3964fe → #6188ff），白字当场掉到 3.24:1。 */
  it('实色按钮的静止 / 悬停 / 按下三态都过 AA', () => {
    for (const mode of ['light', 'dark'] as const) {
      const palette = ANT_PALETTES[mode]
      const faces: Array<[string, string, string]> = [
        ['primary rest', palette.primary, '#ffffff'],
        ['primary hover', palette.primaryHover, '#ffffff'],
        ['primary active', palette.primaryActive, '#ffffff'],
        // 危险按钮的字色是 `dangerInk`（深色下危险底是亮红，白字只有 2.8:1）。
        ['danger rest', palette.error, palette.dangerInk],
        ['danger hover', palette.errorHover, palette.dangerInk],
        ['danger active', palette.errorActive, palette.dangerInk],
      ]
      for (const [name, background, ink] of faces) {
        const ratio = contrast(ink, background)
        expect(ratio, `${mode}: ${name} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(AA)
      }
    }
  })

  /* 悬停必须在视觉上也**看得出**是一档：只挪 4% 明度等于没做（深色主按钮第一版就是这样，
   * 对比度过了、状态却没变化）。这里要求每一档相对上一档至少 10% 明度差。
   *
   * 深色下实色按钮不是拿种子值直接画的 —— AntD 的 darkAlgorithm 会先推一档（CDP 实测：
   * 主按钮 #3358db、危险按钮 #d66363）。这两行按**渲染出来的**那个值起算，否则判据会被
   * 一个并不上屏的种子值带走。 */
  const RENDERED_REST: Record<string, string> = {
    'dark primary': '#3358db',
    'dark danger': '#d66363',
  }

  /* 按钮面本身也要和页面分得开：交互时不能往背景里退。
   * 深色页面已经近黑，所以那里的悬停是「在白字 AA 带内轻微**提亮**」而不是加深 ——
   * 上一版往深走（#2a4ecf）只有 2.68:1，按钮面沉进页面了。
   * 按下是 90ms 的瞬态，豁免这条：那 90ms 里文字仍然 ≥6.8:1。 */
  it('静止与悬停时按钮面与页面至少 3:1', () => {
    const surface: Record<'light' | 'dark', string> = {
      light: token(LIGHT, 'color-bg-base'),
      dark: token(DARK, 'color-major-background'),
    }
    for (const mode of ['light', 'dark'] as const) {
      const palette = ANT_PALETTES[mode]
      const faces: Array<[string, string]> = [
        ['primary rest', RENDERED_REST[`${mode} primary`] ?? palette.primary],
        ['primary hover', palette.primaryHover],
        ['danger rest', RENDERED_REST[`${mode} danger`] ?? palette.error],
        ['danger hover', palette.errorHover],
      ]
      for (const [name, face] of faces) {
        const ratio = contrast(face, surface[mode])
        expect(ratio, `${mode}: ${name} 对页面 = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('悬停与按下各自都是看得见的一档', () => {
    for (const mode of ['light', 'dark'] as const) {
      const palette = ANT_PALETTES[mode]
      const ladder: Array<[string, string[]]> = [
        ['primary', [palette.primary, palette.primaryHover, palette.primaryActive]],
        ['danger', [palette.error, palette.errorHover, palette.errorActive]],
      ]
      for (const [name, steps] of ladder) {
        const rendered = [RENDERED_REST[`${mode} ${name}`] ?? steps[0], steps[1], steps[2]]
        for (let index = 1; index < rendered.length; index += 1) {
          const from = luminance(rendered[index - 1])
          const to = luminance(rendered[index])
          const shift = Math.abs(to - from) / from
          expect(
            shift,
            `${mode}: ${name} 第 ${index} 档只挪了 ${(shift * 100).toFixed(0)}%`,
          ).toBeGreaterThan(0.1)
        }
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
