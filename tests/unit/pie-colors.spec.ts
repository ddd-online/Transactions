/**
 * 饼图的「面积档」：柔和不刺眼不是一句话，是四条能量的判据。
 *
 * 大块填充的柔，来自**色度**而不是明度 —— 再把明度抬高就会跌破 3:1，
 * 8px 的图例点在纸面上化掉、2–4% 的细扇区也一起消失。所以这里锁的是：
 * 对比度 ≥3:1、相邻两片 ΔE76 ≥15、色度 ≤0.125（曲线色板最高 0.247）、深浅两套色相一一对应。
 *
 * 判据值与取舍写在 DESIGN.md「Pie palette」；取值本身在 src/styles/tokens.css。
 */

import { describe, expect, it } from 'vitest'

import { PIE_OTHER_KEY } from '../../shared/domain/pie'
import { piePaletteColor, pieSliceColors, pieTypeColor } from '../../src/theme/chart-colors'
import { block, token, tokensCss } from './css-tokens'

const LIGHT = block(tokensCss, ':root')
const DARK = block(tokensCss, "[data-theme='dark']")
const SYSTEM = block(tokensCss, 'html:not([data-theme])')

/** 面积档的 14 条令牌：10 个名次槽位 +「其他」+ 语义三色。 */
const SLOTS = Array.from({ length: 10 }, (_, index) => `color-pie-${index + 1}`)
const FILLS = [
  ...SLOTS,
  'color-pie-other',
  'color-pie-expense',
  'color-pie-income',
  'color-pie-transfer',
]

// ---------------------------------------------------------------- 颜色计算（只够这几条判据用）

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

/** WCAG 对比度：饼图的每一片都挨着画布，图例点也是同一个颜色。 */
function contrast(a: string, b: string): number {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (high + 0.05) / (low + 0.05)
}

function lab(hex: string): [number, number, number] {
  const [r, g, b] = channels(hex).map(linear)
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883
  const f = (value: number): number => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116)
  const [fx, fy, fz] = [f(x), f(y), f(z)]
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)]
}

function deltaE76(a: string, b: string): number {
  const [l1, a1, b1] = lab(a)
  const [l2, a2, b2] = lab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}

/** OKLCH 的色度与色相：色度判「柔不柔」，色相判两套主题是不是同一个颜色。 */
function oklch(hex: string): { chroma: number; hue: number } {
  const [r, g, b] = channels(hex).map(linear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return { chroma: Math.hypot(a, bb), hue: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360 }
}

function hueGap(a: string, b: string): number {
  const gap = Math.abs(oklch(a).hue - oklch(b).hue)
  return gap > 180 ? 360 - gap : gap
}

function paletteOf(css: string): string[] {
  return SLOTS.map((name) => token(css, name))
}

// ---------------------------------------------------------------- 取色

describe('饼图面积档的取色', () => {
  it('按名次取色：分类与标签同一份，其他永远是中性灰', () => {
    const slices = [{ key: '餐饮美食' }, { key: '交通出行' }, { key: PIE_OTHER_KEY }]
    const category = pieSliceColors(slices, 'category')

    expect(category).toHaveLength(slices.length)
    expect(category[0]).toBe(piePaletteColor(0))
    expect(category[1]).toBe(piePaletteColor(1))
    // 「其他」不是第 3 名：它是中性灰，不占色板槽位
    expect(category[2]).not.toBe(piePaletteColor(2))
    expect(pieSliceColors(slices, 'tag')).toEqual(category)
    // 第 11 个槽位取模（正常到不了：超过 10 组就折成「其他」）
    expect(piePaletteColor(10)).toBe(piePaletteColor(0))
  })

  it('按交易类型取语义色的面积档，认不出的类型落正文次要色', () => {
    const colors = pieSliceColors(
      [{ key: 'expense' }, { key: 'income' }, { key: 'transfer' }],
      'transactionType',
    )

    expect(colors).toEqual([
      pieTypeColor('expense'),
      pieTypeColor('income'),
      pieTypeColor('transfer'),
    ])
    expect(new Set(colors).size).toBe(3)
    expect(pieTypeColor('unknown')).not.toBe(pieTypeColor('expense'))
  })
})

// ---------------------------------------------------------------- 取值契约

describe('饼图面积档的取值', () => {
  it('两套主题都定义齐 14 条令牌，系统跟随与深色一致', () => {
    for (const css of [LIGHT, DARK, SYSTEM]) {
      for (const name of FILLS) expect(token(css, name)).toMatch(/^#[0-9a-f]{6}$/)
    }
    for (const name of FILLS) expect(token(SYSTEM, name)).toBe(token(DARK, name))
  })

  it('没有 DOM 时的兜底与浅色令牌同值（两处各写一遍颜色，最容易悄悄走散）', () => {
    SLOTS.forEach((name, index) => expect(piePaletteColor(index)).toBe(token(LIGHT, name)))
    for (const type of ['expense', 'income', 'transfer']) {
      expect(pieTypeColor(type)).toBe(token(LIGHT, `color-pie-${type}`))
    }
  })

  it('每片色对画布 ≥3:1：图例点是同一个颜色，8px 也得看得见', () => {
    for (const css of [LIGHT, DARK]) {
      const canvas = token(css, 'color-bg-base')
      for (const name of FILLS) {
        expect(contrast(token(css, name), canvas)).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('相邻两片 ≥15，任意两片 ≥13：色度降下来之后靠色相与轻重分开', () => {
    for (const css of [LIGHT, DARK]) {
      const palette = paletteOf(css)
      for (let index = 0; index < palette.length; index += 1) {
        expect(deltaE76(palette[index], palette[(index + 1) % palette.length])).toBeGreaterThanOrEqual(15)
        for (let other = index + 1; other < palette.length; other += 1) {
          expect(deltaE76(palette[index], palette[other])).toBeGreaterThanOrEqual(13)
        }
      }
    }
  })

  it('是面积档而不是曲线档：色度 ≤0.125（曲线色板最高 0.247），深浅两套色相一一对应', () => {
    for (const css of [LIGHT, DARK]) {
      for (const name of FILLS) expect(oklch(token(css, name)).chroma).toBeLessThanOrEqual(0.125)
    }

    const [light, dark] = [paletteOf(LIGHT), paletteOf(DARK)]
    light.forEach((color, index) => {
      expect(hueGap(color, dark[index])).toBeLessThanOrEqual(8)
    })
    for (const type of ['expense', 'income', 'transfer']) {
      expect(hueGap(token(LIGHT, `color-pie-${type}`), token(DARK, `color-pie-${type}`))).toBeLessThanOrEqual(8)
    }
  })
})
