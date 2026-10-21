import { theme, type ThemeConfig } from 'antd'

export type AntdMode = 'light' | 'dark'

interface Palette {
  primary: string
  success: string
  warning: string
  error: string
  text: string
  textSecondary: string
  textTertiary: string
  bgBase: string
  bgContainer: string
  bgElevated: string
  border: string
  borderSecondary: string
  fillSecondary: string
  fillTertiary: string
  hover: string
  active: string
  shadow: string
  shadowSecondary: string
}

/** AntD 只读取这组核心颜色；其余视觉仍由 `--transactions-*` 控制。 */
export const ANT_PALETTES: Record<AntdMode, Palette> = {
  light: {
    primary: '#3964fe',
    success: '#16a34a',
    warning: '#d97706',
    error: '#dc2626',
    text: '#0f1115',
    textSecondary: '#61666b',
    textTertiary: '#81858c',
    bgBase: '#f9fafb',
    bgContainer: '#ffffff',
    bgElevated: '#ffffff',
    border: '#e8eaed',
    borderSecondary: '#eceef1',
    fillSecondary: '#f3f4f6',
    fillTertiary: 'rgba(15, 17, 21, 0.06)',
    hover: 'rgba(15, 17, 21, 0.06)',
    active: 'rgba(57, 100, 254, 0.10)',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
    shadowSecondary: '0 8px 24px rgba(0, 0, 0, 0.10)',
  },
  dark: {
    primary: '#3964fe',
    success: '#4ade80',
    warning: '#fbbf24',
    error: '#f87171',
    text: '#f2f4f8',
    textSecondary: '#b6bcc6',
    textTertiary: '#8a919c',
    bgBase: '#0f1115',
    bgContainer: '#16181d',
    bgElevated: '#1d2026',
    border: 'rgba(255, 255, 255, 0.12)',
    borderSecondary: 'rgba(255, 255, 255, 0.08)',
    fillSecondary: '#14161a',
    fillTertiary: 'rgba(255, 255, 255, 0.08)',
    hover: 'rgba(255, 255, 255, 0.08)',
    active: 'rgba(57, 100, 254, 0.22)',
    shadow: '0 1px 2px rgba(0, 0, 0, 0.30)',
    shadowSecondary: '0 8px 24px rgba(0, 0, 0, 0.45)',
  },
}

export function buildAntdTheme(mode: AntdMode): ThemeConfig {
  const p = ANT_PALETTES[mode]
  return {
    algorithm: mode === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
    token: {
      colorPrimary: p.primary,
      colorInfo: p.primary,
      colorLink: p.primary,
      colorLinkHover: p.primary,
      colorSuccess: p.success,
      colorWarning: p.warning,
      colorError: p.error,
      colorTextBase: p.text,
      colorText: p.text,
      colorTextSecondary: p.textSecondary,
      colorTextTertiary: p.textTertiary,
      colorBgBase: p.bgBase,
      colorBgContainer: p.bgContainer,
      colorBgElevated: p.bgElevated,
      colorBorder: p.border,
      colorBorderSecondary: p.borderSecondary,
      colorFillSecondary: p.fillSecondary,
      colorFillTertiary: p.fillTertiary,
      colorFillQuaternary: p.hover,
      borderRadius: 8,
      borderRadiusSM: 6,
      borderRadiusLG: 12,
      controlHeight: 36,
      controlHeightSM: 28,
      controlHeightLG: 44,
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
      fontSize: 14,
      boxShadow: p.shadow,
      boxShadowSecondary: p.shadowSecondary,
    },
    components: {
      Button: {
        primaryShadow: 'none',
        defaultShadow: 'none',
        dangerShadow: 'none',
        fontWeight: 500,
      },
      Tabs: {
        horizontalItemPadding: '0 12px',
        horizontalItemGutter: 4,
        titleFontSize: 14,
      },
      Table: {
        headerBg: p.fillSecondary,
        headerColor: p.textSecondary,
        rowHoverBg: p.hover,
        borderColor: p.borderSecondary,
        headerSplitColor: p.borderSecondary,
        cellPaddingBlock: 10,
        cellPaddingInline: 12,
      },
      Modal: {
        contentBg: p.bgElevated,
        headerBg: p.bgElevated,
      },
      Select: {
        optionSelectedBg: p.active,
      },
      Segmented: {
        itemSelectedBg: p.bgContainer,
        itemSelectedColor: p.primary,
        trackBg: p.fillSecondary,
      },
      Switch: {
        colorPrimary: p.primary,
      },
      Pagination: {
        itemActiveBg: p.primary,
      },
    },
  }
}
