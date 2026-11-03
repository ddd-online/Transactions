/**
 * 一套色板，两个图表：折线图的「第 N 条曲线」和饼图的「第 N 名」取的是同一个位置。
 *
 * 色板是**九条色相，每条只出现一次**（见 DESIGN.md「Series palette」）：前三条锚在支出红 /
 * 收入绿 / 转账蓝，其余六条是它们之间的过渡。所以这里锁的是三件事：
 * 锚有没有对准语义色、色相有没有重复（重复就是"两个绿"，低色度下认不出）、
 * 相邻与任意两位在明暗上够不够分得开，以及明度带不许下探到深色。
 *
 * 判据与取舍写在 DESIGN.md「Series palette」；取值本身在 src/styles/tokens.css。
 */

import { describe, expect, it } from 'vitest'

import { PIE_MAX_SLICES, PIE_OTHER_KEY } from '../../shared/domain/pie'
import {
  pieSliceColors,
  pieTypeColor,
  seriesColor,
  seriesPalette,
} from '../../src/theme/chart-colors'
import { block, token, tokensCss } from './css-tokens'

const LIGHT = block(tokensCss, ':root')
const DARK = block(tokensCss, "[data-theme='dark']")
const SYSTEM = block(tokensCss, 'html:not([data-theme])')

const SLOTS = Array.from({ length: 9 }, (_, index) => `color-series-${index + 1}`)
const FILLS = [...SLOTS, 'color-series-other']

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

/** WCAG 对比度：图例点与扇区同色，2px 的曲线也靠它站住。 */
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

/** OKLCH：明度判「深不深」、色度判「柔不柔」、色相判是不是重复了。 */
function oklch(hex: string): { l: number; chroma: number; hue: number } {
  const [r, g, b] = channels(hex).map(linear)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  const lightness = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  return {
    l: lightness,
    chroma: Math.hypot(a, bb),
    hue: ((Math.atan2(bb, a) * 180) / Math.PI + 360) % 360,
  }
}

function hueGap(a: string, b: string): number {
  const gap = Math.abs(oklch(a).hue - oklch(b).hue)
  return gap > 180 ? 360 - gap : gap
}

function paletteOf(css: string): string[] {
  return SLOTS.map((name) => token(css, name))
}

// ---------------------------------------------------------------- 取色

describe('一套色板两个图表', () => {
  it('第 N 条曲线与第 N 名是同一个颜色，槽位数就是饼图的折叠上限', () => {
    const palette = seriesPalette()
    expect(palette).toHaveLength(PIE_MAX_SLICES)
    palette.forEach((color, index) => expect(seriesColor(index)).toBe(color))
    // 多于槽位时从头再来（折线多于 9 条也不会没有颜色）
    expect(seriesColor(PIE_MAX_SLICES)).toBe(seriesColor(0))
  })

  it('分类与标签按名次取色板，其他永远是中性灰', () => {
    const slices = [{ key: '餐饮美食' }, { key: '交通出行' }, { key: PIE_OTHER_KEY }]
    const category = pieSliceColors(slices, 'category')

    expect(category).toHaveLength(slices.length)
    expect(category[0]).toBe(seriesColor(0))
    expect(category[1]).toBe(seriesColor(1))
    expect(category[2]).not.toBe(seriesColor(2))
    expect(pieSliceColors(slices, 'tag')).toEqual(category)
  })

  it('按交易类型取色板前三位：支出红 / 收入绿 / 转账蓝', () => {
    const colors = pieSliceColors(
      [{ key: 'expense' }, { key: 'income' }, { key: 'transfer' }],
      'transactionType',
    )

    expect(colors).toEqual([seriesColor(0), seriesColor(1), seriesColor(2)])
    expect(colors).toEqual([pieTypeColor('expense'), pieTypeColor('income'), pieTypeColor('transfer')])
    expect(new Set(colors).size).toBe(3)
    expect(pieTypeColor('unknown')).not.toBe(pieTypeColor('expense'))
  })
})

// ---------------------------------------------------------------- 取值契约

describe('色板的取值', () => {
  it('两套主题都定义齐 10 条令牌，系统跟随与深色一致', () => {
    for (const css of [LIGHT, DARK, SYSTEM]) {
      for (const name of FILLS) expect(token(css, name)).toMatch(/^#[0-9a-f]{6}$/)
    }
    for (const name of FILLS) expect(token(SYSTEM, name)).toBe(token(DARK, name))
  })

  it('没有 DOM 时的兜底与浅色令牌同值（两处各写一遍颜色，最容易悄悄走散）', () => {
    SLOTS.forEach((name, index) => expect(seriesColor(index)).toBe(token(LIGHT, name)))
  })

  it('前三条对准支出红 / 收入绿 / 转账蓝', () => {
    for (const css of [LIGHT, DARK]) {
      const palette = paletteOf(css)
      const anchors = ['color-expense', 'color-income', 'color-transfer'].map((name) =>
        token(css, name),
      )
      anchors.forEach((anchor, index) => {
        expect(hueGap(palette[index], anchor)).toBeLessThanOrEqual(20)
      })
    }
  })

  it('九条色相每条只出现一次：任意两条至少差 24°，没有"两个绿"', () => {
    for (const css of [LIGHT, DARK]) {
      const palette = paletteOf(css)
      for (let i = 0; i < palette.length; i += 1) {
        for (let j = i + 1; j < palette.length; j += 1) {
          expect(hueGap(palette[i], palette[j])).toBeGreaterThanOrEqual(24)
        }
      }
    }
  })

  it('明度带：不再有第二个深色，也没有浅到看不见的', () => {
    for (const css of [LIGHT, DARK]) {
      for (const color of paletteOf(css)) {
        const lightness = oklch(color).l
        expect(lightness).toBeGreaterThanOrEqual(0.55)
        expect(lightness).toBeLessThanOrEqual(0.85)
      }
    }
  })

  it('相邻两位 ≥30，任意两位 ≥23，色度仍在柔和档', () => {
    for (const css of [LIGHT, DARK]) {
      const palette = paletteOf(css)
      for (let index = 0; index < palette.length; index += 1) {
        expect(
          deltaE76(palette[index], palette[(index + 1) % palette.length]),
        ).toBeGreaterThanOrEqual(30)
      }
      for (let i = 0; i < palette.length; i += 1) {
        for (let j = i + 1; j < palette.length; j += 1) {
          expect(deltaE76(palette[i], palette[j])).toBeGreaterThanOrEqual(23)
        }
      }
      for (const color of palette) expect(oklch(color).chroma).toBeLessThanOrEqual(0.17)
    }
  })

  it('对画布：每一片 ≥2.1:1，其中至少五条 ≥3:1', () => {
    const canvas = token(LIGHT, 'color-bg-base')
    const ratios = paletteOf(LIGHT).map((color) => contrast(color, canvas))
    expect(Math.min(...ratios)).toBeGreaterThanOrEqual(2.1)
    expect(ratios.filter((ratio) => ratio >= 3).length).toBeGreaterThanOrEqual(5)

    const darkCanvas = token(DARK, 'color-bg-base')
    for (const color of paletteOf(DARK)) {
      expect(contrast(color, darkCanvas)).toBeGreaterThanOrEqual(3)
    }
  })

  it('浅深两套色相一一对应', () => {
    const [light, dark] = [paletteOf(LIGHT), paletteOf(DARK)]
    light.forEach((color, index) => {
      expect(hueGap(color, dark[index])).toBeLessThanOrEqual(8)
    })
  })
})
