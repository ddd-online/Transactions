/**
 * 事件身份色的判据。
 *
 * 这 20 档是**内容**（用户挑中的十六进制写进库），不是 chrome —— 所以它们不在 `tokens.css`
 * 里，但一样要有下限：6px 圆点与 3px 竖条都算「有意义的图形」，WCAG 1.4.11 要 3:1。
 * 此前有两条不达标（土黄 2.57:1、橘黄 2.72:1），一列事件里最先糊掉的就是它们。
 *
 * 深色下这 20 个值由 CSS 往白里提 32%（`.key-event-tone`）；这里把同一份混合算一遍，
 * 确认提亮之后仍然认得出是同一档色（色相没跑偏）。
 */

import { describe, expect, it } from 'vitest'

import { EVENT_TONE_DARK_LIFT, EVENT_TONES } from '../../src/theme/event-colors'
import { block, token, tokensCss } from './css-tokens'

const LIGHT = block(tokensCss, ':root')
const DARK = block(tokensCss, "[data-theme='dark']")

/** 事件卡片与圆点落在画布与纸面上（事件页是平铺的，卡片本身透明）。 */
const LIGHT_SURFACES = ['color-major-background', 'color-bg-base']
const DARK_SURFACES = ['color-major-background', 'color-bg-base']

const GRAPHIC_MINIMUM = 3

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

/** 与 CSS `color-mix(in srgb, var(--event-tone) 68%, #ffffff)` 同一段算术（sRGB 空间）。 */
function liftTowardWhite(hex: string, amount: number): string {
  const mixed = channels(hex).map((channel) => Math.round((channel * (1 - amount) + amount) * 255))
  return `#${mixed.map((value) => value.toString(16).padStart(2, '0')).join('')}`
}

/** 色相角（0–360）：提亮之后还得是同一档色。 */
function hue(hex: string): number {
  const [r, g, b] = channels(hex)
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  if (max === min) return 0
  const delta = max - min
  const raw =
    max === r ? ((g - b) / delta) % 6 : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4
  return (raw * 60 + 360) % 360
}

function hueGap(a: string, b: string): number {
  const difference = Math.abs(hue(a) - hue(b))
  return Math.min(difference, 360 - difference)
}

describe('event identity tones', () => {
  it('每一档都有名字与值，且都不重复', () => {
    expect(EVENT_TONES).toHaveLength(20)
    expect(new Set(EVENT_TONES.map((tone) => tone.name)).size).toBe(EVENT_TONES.length)
    expect(new Set(EVENT_TONES.map((tone) => tone.value)).size).toBe(EVENT_TONES.length)
  })

  it('每一档在画布与纸面上都过 3:1（非文本对比）', () => {
    const failures: string[] = []
    for (const tone of EVENT_TONES) {
      for (const surface of LIGHT_SURFACES) {
        const ratio = contrast(tone.value, token(LIGHT, surface))
        if (ratio < GRAPHIC_MINIMUM) {
          failures.push(`${tone.name} ${tone.value} on ${surface} = ${ratio.toFixed(2)}:1`)
        }
      }
    }
    expect(failures).toEqual([])
  })

  it('深色提亮之后仍然过 3:1，且还是同一档色相', () => {
    for (const tone of EVENT_TONES) {
      const lifted = liftTowardWhite(tone.value, EVENT_TONE_DARK_LIFT)
      for (const surface of DARK_SURFACES) {
        const ratio = contrast(lifted, token(DARK, surface))
        expect(ratio, `${tone.name} 深色 on ${surface} = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
          GRAPHIC_MINIMUM,
        )
      }
      // 往白里混会轻微降饱和，但不该换一个色相：差 10° 以内还是同一档。
      expect(hueGap(tone.value, lifted), `${tone.name} 色相跑偏`).toBeLessThan(10)
    }
  })

  it('被替换掉的那两档不再出现在色板里', () => {
    const values = EVENT_TONES.map((tone) => tone.value.toUpperCase())
    expect(values).not.toContain('#C6963A')
    expect(values).not.toContain('#D48838')
  })
})
