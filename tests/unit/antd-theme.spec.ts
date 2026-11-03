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
})
