import { useCallback, useEffect, useState, type JSX } from 'react'
import { Input, Switch as AntSwitch } from 'antd'

import {
  CLOSE_BEHAVIOR_ASK,
  CLOSE_BEHAVIOR_QUIT,
  CLOSE_BEHAVIOR_TRAY,
  normalizeCloseBehavior,
} from '../../shared/domain/consts'
import { errorMessage } from '../../shared/errors'
import type { UpdateSnapshot } from '../../shared/domain/update'
import type { ConfigSnapshot, FeatureFlags } from '../../shared/types/config'
import { AppMark } from '../components/app-mark'
import { Button } from '../components/button'
import { FileButton } from '../components/file-button'
import { Icon } from '../components/icon'
import { PageLayout } from '../components/page-layout'
import { Segmented } from '../components/segmented'
import { SettingsRow } from '../components/settings-row'
import { notify } from '../components/toast'
import { DiaryTransfer } from './diary-transfer'
import { SettingsData } from './settings-data'
import { UpdatePanel } from './update-panel'

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

const FEATURES: ReadonlyArray<{
  key: keyof FeatureFlags
  title: string
  description: string
}> = [
  { key: 'accounting', title: '记账', description: '记录 / 分析 / 标签 / 模板，默认功能' },
  { key: 'stock', title: '股票', description: '建仓、持仓、成交与资金记录、行情统计' },
  { key: 'keyEvent', title: '事件', description: '关键事件与日记、交易的关联' },
  { key: 'diary', title: '日记', description: '按账本隔离的纯文本日记，可导入导出 txt' },
  { key: 'todo', title: '待办', description: '卡片式待办、进度记录与四象限视图' },
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
  const [proxyState, setProxyState] = useState<'idle' | 'ok' | 'fail'>('idle')
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
        <div className="st-list">
          <SettingsRow title="工作空间" description={workspace || '尚未选择工作空间'} mono>
            <Button
              variant="secondary"
              testId="open-workspace"
              disabled={picking}
              onClick={() => void pickWorkspace()}
            >
              切换
            </Button>
          </SettingsRow>

          <div className="st-card">
            <div className="st-card-info">
              <span className="st-card-title">软件图标</span>
              <span className="st-card-desc">
                侧栏左上角的方形图标；保存在当前工作空间里，切换工作空间会跟着换
              </span>
            </div>
            <div className="st-card-action">
              {workspaceIconUrl ? <img className="st-icon-preview" src={workspaceIconUrl} alt="" /> : null}
              <FileButton
                testId="workspace-icon-input"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onSelect={(file) => void changeWorkspaceIcon(file)}
              />
              <Button
                variant="secondary"
                testId="workspace-icon-clear"
                onClick={() => void clearWorkspaceIcon()}
              >
                恢复默认
              </Button>
            </div>
          </div>

          <SettingsRow title="外观" description="界面配色，可跟随系统">
            <Segmented
              testId="appearance"
              value={config?.appearance ?? 'system'}
              disabled={!config}
              onChange={(value) => void setAppearance(value)}
              options={[
                { value: 'light', label: '浅色' },
                { value: 'dark', label: '深色' },
                { value: 'system', label: '跟随系统' },
              ]}
            />
          </SettingsRow>

          <SettingsRow title="关闭行为" description="点击右上角关闭按钮时的行为">
            <Segmented
              testId="close-behavior"
              value={normalizeCloseBehavior(config?.closeBehavior)}
              disabled={!config}
              onChange={(value) => void setCloseBehavior(value)}
              options={[
                { value: CLOSE_BEHAVIOR_QUIT, label: '直接退出' },
                { value: CLOSE_BEHAVIOR_TRAY, label: '最小化到托盘' },
                { value: CLOSE_BEHAVIOR_ASK, label: '每次询问' },
              ]}
            />
          </SettingsRow>

          <div className="st-card">
            <div className="st-card-info">
              <span className="st-card-title">
                代理
                {proxyState !== 'idle' ? (
                  <span
                    className={`st-proxy-dot is-${proxyState}`}
                    title={proxyState === 'ok' ? '上次检测：连通' : '上次检测：失败'}
                  />
                ) : null}
              </span>
              <span className="st-card-desc">
                网络请求（行情、更新检查）走 HTTP 代理；检测会用当前设置请求 GitHub
              </span>
            </div>
            <div className="st-card-action">
              <Segmented
                testId="proxy-mode"
                value={proxyMode}
                disabled={!config}
                onChange={(value) => {
                  setProxyMode(value)
                  setProxyState('idle')
                }}
                options={[
                  { value: 'off', label: '不使用' },
                  { value: 'auto', label: '自动探测' },
                  { value: 'manual', label: '手动' },
                ]}
              />
              {proxyMode === 'auto' ? (
                <Input
                  className="st-proxy-resolved"
                  data-testid="proxy-resolved"
                  readOnly
                  value={proxyResolved}
                  placeholder="探测中…"
                  title="自动探测到的代理地址"
                />
              ) : null}
              {proxyMode === 'manual' ? (
                <Input
                  data-testid="proxy-url"
                  placeholder="http://127.0.0.1:7890"
                  value={proxyUrl}
                  disabled={!config}
                  onChange={(event) => {
                    setProxyUrl(event.target.value)
                    setProxyState('idle')
                  }}
                />
              ) : null}
              {proxyMode === 'manual' ? (
                <Button
                  variant="secondary"
                  testId="proxy-save"
                  disabled={!config}
                  onClick={() => void saveProxy()}
                >
                  保存
                </Button>
              ) : null}
              {proxyMode !== 'off' ? (
                <Button
                  variant="secondary"
                  testId="proxy-detect"
                  loading={proxyTesting}
                  disabled={!config || proxyTesting}
                  onClick={() => void detectProxy()}
                >
                  检测
                </Button>
              ) : null}
            </div>
          </div>

          <SettingsRow title="开发者工具" description="打开开发者工具，用于调试界面代码">
            <Button
              variant="secondary"
              testId="devtools-open"
              onClick={() => void window.api.invoke('devtools_toggle', { enabled: true })}
            >
              打开
            </Button>
          </SettingsRow>
        </div>
      ) : null}

      {tab === 'features' ? (
        <div className="st-feature-pane">
          {!activeLedgerId ? (
            <div className="st-feature-hint" data-testid="feature-hint">
              当前没有账本：以下开关作为默认值，新账本沿用。
            </div>
          ) : null}
          <div className="st-list">
            {FEATURES.map(({ key, title, description }) => {
              const checked = activeLedgerId
                ? (effectiveFeatures?.[key] ?? true)
                : (config?.features[key] ?? true)
              return (
                <div className="st-card" key={key} data-testid={`feature-row-${key}`}>
                  <div className="st-card-info">
                    <span className="st-card-title">{title}</span>
                    <span className="st-card-desc">{description}</span>
                  </div>
                  <div className="st-card-action">
                    <AntSwitch
                      checked={checked}
                      disabled={!config}
                      data-testid={`feature-${key}`}
                      aria-label={title}
                      onChange={(next) => void setFeature(key, next)}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        </div>
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

      {tab === 'diary' ? <DiaryTransfer ledgerId={activeLedgerId} /> : null}

      {tab === 'about' ? (
        <div className="st-about">
          <div className="st-about-main">
            <div className="st-about-header">
              <div className="st-app-logo">
                <AppMark />
              </div>
              <h2 className="st-app-name">Transactions</h2>
              <p className="st-app-version">版本 {version}</p>
            </div>
            <UpdatePanel snapshot={updateSnapshot} onSnapshot={onUpdateSnapshot} />
            <div className="st-about-footer">
              <a
                className="st-about-link"
                href="https://github.com/ddd-online/Transactions"
                target="_blank"
                rel="noreferrer"
              >
                <Icon name="GitHub" size={14} />
                <span className="st-about-link-text">GitHub</span>
              </a>
              <p className="st-about-copyright">
                © {new Date().getFullYear()} Transactions. All rights reserved.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </PageLayout>
  )
}
