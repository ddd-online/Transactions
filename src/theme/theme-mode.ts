/**
 * 当前外观（浅色 / 深色）的运行时读数。
 *
 * AntD 那一层有自己的 `useEffectiveMode`（要吃设置里的 `appearance` 属性）；
 * 这里读的是**真正生效的那一层** —— `tokens.css` 是在 `<html data-theme>` 与
 * `prefers-color-scheme` 上分支的，所以问 DOM 比问设置更准，也顺手覆盖了「跟随系统」。
 *
 * 存在的理由只有一个：画布读不到 CSS 变量。颜色在挂载时被解析成十六进制交给 G2 / Canvas，
 * 主题一变，已经画好的图不会自己换色 —— 让用到颜色的组件重新渲染一次，就得有一个订阅。
 */

import { useEffect, useState } from 'react'

const DARK_MEDIA = '(prefers-color-scheme: dark)'

export type ThemeMode = 'light' | 'dark'

export function currentThemeMode(): ThemeMode {
  const explicit = document.documentElement.dataset.theme
  if (explicit === 'dark' || explicit === 'light') return explicit
  return window.matchMedia?.(DARK_MEDIA).matches ? 'dark' : 'light'
}

/** 当前主题，并在 `data-theme` 或系统偏好变化时通知调用方（用于重算画布颜色）。 */
export function useThemeMode(): ThemeMode {
  const [mode, setMode] = useState<ThemeMode>(currentThemeMode)

  useEffect(() => {
    const media = window.matchMedia(DARK_MEDIA)
    const sync = (): void => setMode(currentThemeMode())
    sync()
    media.addEventListener('change', sync)
    const observer = new MutationObserver(sync)
    observer.observe(document.documentElement, { attributeFilter: ['data-theme'] })
    return () => {
      media.removeEventListener('change', sync)
      observer.disconnect()
    }
  }, [])

  return mode
}
