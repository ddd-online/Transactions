import { useCallback, useEffect, useState, type JSX } from 'react'

import { errorMessage } from '../../shared/errors'
import type { UpdateSnapshot } from '../../shared/domain/update'
import type { ConfigSnapshot, FeatureFlags } from '../../shared/types/config'
import { PageLayout } from '../components/page-layout'
import { notify } from '../components/toast'
import { SettingsAbout, SettingsDiary } from './settings-about'
import { SettingsData } from './settings-data'
import { SettingsFeatures } from './settings-features'
import { SettingsGeneral, type ProxyState } from './settings-general'

/**
 * 设置页：五个分栏、四类写入（外观 / 关闭行为 / 代理 / 功能开关）、图标与关于。
 *
 * 它从外壳里搬出来了 —— 外壳只关心「现在哪一页、哪个账本」，设置自己的草稿、
 * 探测状态与消息回执都在这里；它向外只报告三件外壳确实需要知道的事：
 * 配置换了（主题 / 导航可见性）、图标换了（侧栏左上角）、以及「切换工作空间」这个动作。
 */

type SettingsTab = 'general' | 'features' | 'data' | 'diary' | 'about'

const TABS: ReadonlyArray<readonly [SettingsTab, string]> = [
  ['general', '通用设置'],
  ['features', '功能开关'],
  ['data', '数据'],
  ['diary', '日记配置'],
  ['about', '关于软件'],
]

export interface SettingsPageProps {
  /** 当前工作空间目录（未打开时为空串） */
  workspace: string
  /** 当前账本：功能开关按账本覆盖全局默认 */
  activeLedgerId: string
  config: ConfigSnapshot | null
  /** 全局默认 + 当前账本的覆盖，已在外壳里算好（导航可见性读的是同一份） */
  effectiveFeatures: FeatureFlags | null
  version: string
  workspaceIconUrl: string
  updateSnapshot: UpdateSnapshot | null
  onUpdateSnapshot: (snapshot: UpdateSnapshot | null) => void
  /** 换一个工作空间：由外壳弹目录框并落库 */
  onPickWorkspace: () => Promise<void>
  /** 直接打开某个目录（数据分栏的最近工作空间）：由外壳落库并刷新 */
  onOpenWorkspace: (dir: string) => Promise<void>
  /** 配置改了：外壳据此换主题、收放导航 */
  onConfigChanged: (config: ConfigSnapshot) => void
  /** 图标改了：侧栏左上角立刻跟着换 */
  onWorkspaceIconChanged: (url: string) => void
}

export function SettingsPage({
  workspace,
  activeLedgerId,
  config,
  effectiveFeatures,
  version,
  workspaceIconUrl,
  updateSnapshot,
  onUpdateSnapshot,
  onPickWorkspace,
  onOpenWorkspace,
  onConfigChanged,
  onWorkspaceIconChanged,
}: SettingsPageProps): JSX.Element {
  const [tab, setTab] = useState<SettingsTab>('general')
  const [proxyMode, setProxyMode] = useState('auto')
  const [proxyUrl, setProxyUrl] = useState('')
  const [proxyTesting, setProxyTesting] = useState(false)
  const [proxyResolved, setProxyResolved] = useState('')
  const [proxyState, setProxyState] = useState<ProxyState>('idle')
  const [picking, setPicking] = useState(false)

  const applyConfig = useCallback(
    (next: ConfigSnapshot): void => {
      onConfigChanged(next)
    },
    [onConfigChanged],
  )

  // 代理草稿跟着库里那份走：换工作空间 / 别的入口改了配置，这一页也跟着同步。
  useEffect(() => {
    if (!config) return
    setProxyMode(config.proxy.mode)
    setProxyUrl(config.proxy.url)
  }, [config?.proxy.mode, config?.proxy.url])

  // 自动探测：只在这一页需要显示「探测到的是什么」时跑。
  useEffect(() => {
    if (!config || proxyMode !== 'auto') {
      setProxyResolved('')
      return
    }
    let alive = true
    setProxyResolved('探测中…')
    void (async () => {
      try {
        const result = await window.api.invoke('proxy_resolve', { mode: 'auto', url: '' })
        if (alive) setProxyResolved(result.url || '直连')
      } catch {
        if (alive) setProxyResolved('未探测到')
      }
    })()
    return () => {
      alive = false
    }
  }, [config?.proxy.mode, config?.proxy.url, proxyMode])

  const pickWorkspace = async (): Promise<void> => {
    setPicking(true)
    try {
      await onPickWorkspace()
    } finally {
      setPicking(false)
    }
  }

  const setAppearance = async (appearance: string): Promise<void> => {
    try {
      await window.api.invoke('config_set_appearance', { appearance })
      if (config) applyConfig({ ...config, appearance })
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  const setCloseBehavior = async (behavior: string): Promise<void> => {
    try {
      await window.api.invoke('config_set_close_behavior', { behavior })
      if (config) applyConfig({ ...config, closeBehavior: behavior })
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  const saveProxy = async (): Promise<void> => {
    try {
      const proxy = await window.api.invoke('config_set_proxy', { mode: proxyMode, url: proxyUrl })
      if (config) applyConfig({ ...config, proxy })
      notify('代理设置已保存')
    } catch (error) {
      // 设置项保存失败是一次动作的回执，不该在页面顶上留一行字：走消息，和「代理连通正常」同一处。
      notify(errorMessage(error), 'error')
    }
  }

  const detectProxy = async (): Promise<void> => {
    setProxyTesting(true)
    try {
      const result = await window.api.invoke('proxy_test', { mode: proxyMode, url: proxyUrl })
      setProxyState(result.ok ? 'ok' : 'fail')
      notify(result.message, result.ok ? 'success' : 'error')
    } catch (error) {
      setProxyState('fail')
      notify(`代理连接失败：${errorMessage(error)}`, 'error')
    } finally {
      setProxyTesting(false)
    }
  }

  // 改了代理设置，上一次的检测结果就不作数了：那枚小圆点回到 idle。
  const changeProxyMode = (mode: string): void => {
    setProxyMode(mode)
    setProxyState('idle')
  }

  const changeProxyUrl = (url: string): void => {
    setProxyUrl(url)
    setProxyState('idle')
  }

  const openDevtools = (): void => {
    void window.api.invoke('devtools_toggle', { enabled: true })
  }

  const setFeature = async (feature: string, enabled: boolean): Promise<void> => {
    if (!config) return
    // 乐观更新：受控开关要立刻反映点击，不能等 IPC 回来再渲染。
    const next: ConfigSnapshot = activeLedgerId
      ? {
          ...config,
          ledgerFeatures: {
            ...config.ledgerFeatures,
            [activeLedgerId]: { ...(config.ledgerFeatures[activeLedgerId] ?? {}), [feature]: enabled },
          },
        }
      : { ...config, features: { ...config.features, [feature]: enabled } }
    applyConfig(next)
    try {
      const flags = await window.api.invoke('config_set_feature', {
        feature,
        enabled,
        ...(activeLedgerId ? { ledgerId: activeLedgerId } : {}),
      })
      if (activeLedgerId) {
        applyConfig({
          ...next,
          ledgerFeatures: { ...next.ledgerFeatures, [activeLedgerId]: flags },
        })
      } else {
        applyConfig({ ...next, features: flags })
      }
    } catch (error) {
      notify(errorMessage(error), 'error')
      const snapshot = await window.api.invoke('config_get')
      applyConfig(snapshot)
    }
  }

  const changeWorkspaceIcon = async (file: File | undefined): Promise<void> => {
    if (!file) return
    try {
      const data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onload = () => resolve(String(reader.result))
        reader.onerror = () => reject(reader.error ?? new Error('读取图标失败'))
        reader.readAsDataURL(file)
      })
      const relative = await window.api.invoke('workspace_icon_set', { data })
      if (relative) {
        onWorkspaceIconChanged(await window.api.invoke('asset_url', { filePath: relative }))
        notify('工作空间图标已更新')
      }
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  const clearWorkspaceIcon = async (): Promise<void> => {
    try {
      await window.api.invoke('workspace_icon_set', { data: '' })
      onWorkspaceIconChanged('')
    } catch (error) {
      notify(errorMessage(error), 'error')
    }
  }

  return (
    <PageLayout
      contentClassName="settings-page-content"
      toolbar={
        <div className="st-tabbar" role="tablist" aria-label="设置分栏">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              data-testid={`settings-tab-${key}`}
              className={`st-tab${tab === key ? ' is-active' : ''}`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      }
    >
      {tab === 'general' ? (
        <SettingsGeneral
          workspace={workspace}
          config={config}
          workspaceIconUrl={workspaceIconUrl}
          picking={picking}
          proxyMode={proxyMode}
          proxyUrl={proxyUrl}
          proxyResolved={proxyResolved}
          proxyState={proxyState}
          proxyTesting={proxyTesting}
          onPickWorkspace={pickWorkspace}
          onAppearanceChange={setAppearance}
          onCloseBehaviorChange={setCloseBehavior}
          onProxyModeChange={changeProxyMode}
          onProxyUrlChange={changeProxyUrl}
          onProxySave={saveProxy}
          onProxyDetect={detectProxy}
          onWorkspaceIconChange={changeWorkspaceIcon}
          onWorkspaceIconClear={clearWorkspaceIcon}
          onOpenDevtools={openDevtools}
        />
      ) : null}

      {tab === 'features' ? (
        <SettingsFeatures
          activeLedgerId={activeLedgerId}
          config={config}
          effectiveFeatures={effectiveFeatures}
          onFeatureChange={setFeature}
        />
      ) : null}

      {tab === 'data' ? (
        <SettingsData
          workspace={workspace}
          config={config}
          onPickWorkspace={onPickWorkspace}
          onOpenWorkspace={onOpenWorkspace}
          onConfigChanged={onConfigChanged}
        />
      ) : null}

      {tab === 'diary' ? <SettingsDiary ledgerId={activeLedgerId} /> : null}

      {tab === 'about' ? (
        <SettingsAbout
          version={version}
          updateSnapshot={updateSnapshot}
          onUpdateSnapshot={onUpdateSnapshot}
        />
      ) : null}
    </PageLayout>
  )
}
