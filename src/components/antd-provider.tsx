import { App as AntApp, ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { useEffect, useState, type JSX, type ReactNode } from 'react'

import { buildAntdTheme, type AntdMode } from '../theme/antd-theme'
import { ToastHost } from './toast'

export interface AntdProviderProps {
  appearance?: string
  children: ReactNode
}

function useEffectiveMode(appearance?: string): AntdMode {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const update = (): void => setSystemDark(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])

  if (appearance === 'dark') return 'dark'
  if (appearance === 'light') return 'light'
  return systemDark ? 'dark' : 'light'
}

/** AntD 主题与上下文入口；不产生额外 DOM，不引入全局 reset。 */
export function AntdProvider({ appearance, children }: AntdProviderProps): JSX.Element {
  const mode = useEffectiveMode(appearance)
  return (
    <ConfigProvider locale={zhCN} theme={buildAntdTheme(mode)}>
      <AntApp component={false}>
        <ToastHost />
        {children}
      </AntApp>
    </ConfigProvider>
  )
}
