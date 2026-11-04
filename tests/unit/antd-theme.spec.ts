import { describe, expect, it } from 'vitest'

import { ANT_PALETTES } from '../../src/theme/antd-theme'
import { block, token, tokensCss } from './css-tokens'

const light = block(tokensCss, ':root')
const dark = block(tokensCss, "[data-theme='dark']")

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

  /* 文字色是整套界面里出现最多的一档颜色，此前只对了 primary/text/secondary ——
   * 三级灰因此能悄悄停在 #81858c（浅色 3.55:1）而不红。这六档逐一对齐。 */
  it.each(['major', 'secondary', 'tertiary'] as const)('keeps %s text in sync in both themes', (tier) => {
    const key = tier === 'major' ? 'text' : tier === 'secondary' ? 'textSecondary' : 'textTertiary'
    expect(token(light, `color-text-${tier}`)).toBe(ANT_PALETTES.light[key])
    expect(token(dark, `color-text-${tier}`)).toBe(ANT_PALETTES.dark[key])
  })

  it('keeps the semantic accents in sync with design tokens', () => {
    expect(token(light, 'color-primary')).toBe(ANT_PALETTES.light.primary)
    expect(token(light, 'color-expense')).toBe(ANT_PALETTES.light.error)
    expect(token(light, 'color-income')).toBe(ANT_PALETTES.light.success)
    expect(token(dark, 'color-primary')).toBe(ANT_PALETTES.dark.primary)
    expect(token(dark, 'color-expense')).toBe(ANT_PALETTES.dark.error)
    expect(token(dark, 'color-income')).toBe(ANT_PALETTES.dark.success)
  })
})
