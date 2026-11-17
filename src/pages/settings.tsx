import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import { errorMessage } from '../../shared/errors'
import type { UpdateSnapshot } from '../../shared/domain/update'
import type { ConfigSnapshot, FeatureFlags } from '../../shared/types/config'
import { Icon, type IconName } from '../components/icon'
import { ScrollArea } from '../components/scroll-area'
import { notify } from '../components/toast'
import { Tooltip } from '../components/tooltip'
import { SettingsAbout, SettingsDiary } from './settings-about'
import { SettingsData } from './settings-data'
import { SettingsFeatures } from './settings-features'
import { SettingsGeneral, type ProxyState } from './settings-general'

/**
 * 设置：一块浮在应用上的两栏面板（左分栏、右内容），不是又一页。
 *
 * 外壳只关心「开没开、哪一栏」；设置自己的草稿、探测状态与消息回执都在这里，
 * 向外只报告三件外壳确实需要知道的事：配置换了（主题 / 导航可见性）、
 * 图标换了（数据页预览）、以及「切换工作空间」这个动作。
 *
 * 浮层是**非模态**的：点面板外面会关掉它，但那一击照常落到下面的控件上（点侧栏
 * 就切页、点应用菜单就弹菜单）—— 设置是工具窗，不是拦住整屏的确认框。只在没有
 * 任何功能页可回（功能全关）时，关闭入口才不出现。
 */

export type SettingsTab = 'general' | 'features' | 'data' | 'diary' | 'about'

const TABS: ReadonlyArray<readonly [SettingsTab, string, IconName]> = [
  ['general', '通用设置', 'Setting'],
  ['features', '功能开关', 'Sliders'],
  ['data', '数据', 'Inbox'],
  ['diary', '日记配置', 'Read'],
  ['about', '关于软件', 'InfoCircle'],
]

/** 分区标题旁的 ⓘ：只解释这一栏没说清的那半句，不占一行正文。 */
function tabTip(tab: SettingsTab, activeLedgerId: string): string {
  if (tab !== 'features') return ''
  return activeLedgerId
    ? '只对当前账本生效；关掉的不进导航'
    : '当前没有账本：这些开关是新账本的默认值'
}

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
  /** 当前分栏由外壳持有：应用菜单可以直接落到「关于软件」。 */
  tab: SettingsTab
  onTabChange: (tab: SettingsTab) => void
  /** 关闭浮层：没有可回的功能页时（功能全关）外壳会传 false，只留关闭入口不可用。 */
  canClose: boolean
  /** 关闭浮层：`restoreFocus` 只在显式关闭（× / Esc）时为真 ——
   *  点外面是为了继续操作下面那个控件，焦点不该被拉回设置入口。 */
  onClose: (restoreFocus?: boolean) => void
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
  tab,
  onTabChange,
  canClose,
  onClose,
  onUpdateSnapshot,
  onPickWorkspace,
  onOpenWorkspace,
  onConfigChanged,
  onWorkspaceIconChanged,
}: SettingsPageProps): JSX.Element {
  const [proxyMode, setProxyMode] = useState('auto')
  const [proxyUrl, setProxyUrl] = useState('')
  const [proxyTesting, setProxyTesting] = useState(false)
  const [proxyResolved, setProxyResolved] = useState('')
  const [proxyState, setProxyState] = useState<ProxyState>('idle')
  const [picking, setPicking] = useState(false)
  const dialogRef = useRef<HTMLDivElement>(null)

  // 打开时把焦点交给面板；Esc / 点外面关闭（非模态：外面那一击照常生效）。
  useEffect(() => {
    dialogRef.current?.focus()
  }, [])

  useEffect(() => {
    if (!canClose) return
    // 面板里弹出的 AntD 浮层（恢复备份、下拉、气泡）挂在 body 上，**不在** dialog 里：
    // 点它们不算「点外面」，否则确认框会在 pointerdown 时被一起卸掉。
    const inPortal = (target: EventTarget | null): boolean =>
      target instanceof Element &&
      target.closest(
        '.ant-modal-root, .ant-select-dropdown, .ant-picker-dropdown, .ant-popover, .ant-tooltip, .ant-message',
      ) !== null
    const modalOpen = (): boolean =>
      Array.from(document.querySelectorAll('.ant-modal-wrap')).some(
        (element) => element.getClientRects().length > 0,
      )
    const onPointerDown = (event: PointerEvent): void => {
      if (dialogRef.current?.contains(event.target as Node)) return
      if (inPortal(event.target)) return
      onClose()
    }
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || modalOpen()) return
      event.stopPropagation()
      onClose(true)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [canClose, onClose])

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

  const currentLabel = TABS.find(([key]) => key === tab)?.[1] ?? '设置'
  const currentTip = tabTip(tab, activeLedgerId)

  return (
    <div className="settings-layer" data-testid="settings-layer">
      <div
        ref={dialogRef}
        className="settings-dialog"
        role="dialog"
        aria-label="设置"
        tabIndex={-1}
      >
        <aside className="settings-nav">
          <div className="settings-nav__head">设置</div>
          <nav className="settings-nav__list" aria-label="设置分栏">
            {TABS.map(([key, label, icon]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                data-testid={`settings-tab-${key}`}
                className={`settings-nav__item${tab === key ? ' is-active' : ''}`}
                onClick={() => onTabChange(key)}
              >
                <Icon name={icon} size={16} />
                <span>{label}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="settings-main">
          <header className="settings-main__head">
            <div className="settings-main__heading">
              <h2 className="settings-main__title">{currentLabel}</h2>
              {currentTip ? (
                <Tooltip text={currentTip} focusTrigger>
                  <span
                    className="settings-main__hint"
                    data-testid="feature-hint"
                    role="img"
                    tabIndex={0}
                    aria-label={currentTip}
                  >
                    <Icon name="InfoCircle" size={12} />
                  </span>
                </Tooltip>
              ) : null}
            </div>
            {canClose ? (
              <button
                type="button"
                className="settings-main__close"
                data-testid="settings-close"
                aria-label="关闭设置"
                title="关闭设置"
                onClick={() => onClose(true)}
              >
                <Icon name="Close" size={16} />
              </button>
            ) : null}
          </header>

          <ScrollArea className="settings-main__scroll">
            <div className="settings-main__body">
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
            </div>
          </ScrollArea>
        </section>
      </div>
    </div>
  )
}

