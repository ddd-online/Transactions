/**
 * 设置 · 通用分栏：工作空间、软件图标、外观、关闭行为、代理与开发者工具。
 *
 * 草稿状态、配置写入、代理探测与图标读写都在设置页；这里只收当前值与回调，
 * 按原样渲染。代理那两处「改了就清掉上次检测结果」的副作用也留在页面。
 */

import { Input } from 'antd'
import type { JSX } from 'react'

import {
  CLOSE_BEHAVIOR_ASK,
  CLOSE_BEHAVIOR_QUIT,
  CLOSE_BEHAVIOR_TRAY,
  normalizeCloseBehavior,
} from '../../shared/domain/consts'
import type { ConfigSnapshot } from '../../shared/types/config'
import { Button } from '../components/button'
import { FileButton } from '../components/file-button'
import { Segmented } from '../components/segmented'
import { SettingsRow } from '../components/settings-row'

/** 上次代理检测的结果；`idle` 表示还没测过，不显示那枚小圆点。 */
export type ProxyState = 'idle' | 'ok' | 'fail'

export interface SettingsGeneralProps {
  /** 当前工作空间目录（未打开时为空串） */
  workspace: string
  config: ConfigSnapshot | null
  workspaceIconUrl: string
  /** 目录框开着：切换按钮进入进行中态 */
  picking: boolean
  proxyMode: string
  proxyUrl: string
  /** 自动模式下探测到的地址（「探测中…」「直连」「未探测到」也是它的取值） */
  proxyResolved: string
  proxyState: ProxyState
  proxyTesting: boolean
  onPickWorkspace: () => void
  onAppearanceChange: (appearance: string) => void
  onCloseBehaviorChange: (behavior: string) => void
  /** 换代理模式：页面同时把上次的检测结果清掉 */
  onProxyModeChange: (mode: string) => void
  /** 改手动地址：页面同时把上次的检测结果清掉 */
  onProxyUrlChange: (url: string) => void
  onProxySave: () => void
  onProxyDetect: () => void
  onWorkspaceIconChange: (file: File | undefined) => void
  onWorkspaceIconClear: () => void
  onOpenDevtools: () => void
}

export function SettingsGeneral({
  workspace,
  config,
  workspaceIconUrl,
  picking,
  proxyMode,
  proxyUrl,
  proxyResolved,
  proxyState,
  proxyTesting,
  onPickWorkspace,
  onAppearanceChange,
  onCloseBehaviorChange,
  onProxyModeChange,
  onProxyUrlChange,
  onProxySave,
  onProxyDetect,
  onWorkspaceIconChange,
  onWorkspaceIconClear,
  onOpenDevtools,
}: SettingsGeneralProps): JSX.Element {
  return (
    <div className="st-list">
      <SettingsRow title="工作空间" description={workspace || '尚未选择工作空间'} mono>
        <Button
          variant="secondary"
          testId="open-workspace"
          disabled={picking}
          onClick={() => void onPickWorkspace()}
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
            onSelect={(file) => void onWorkspaceIconChange(file)}
          />
          <Button
            variant="secondary"
            testId="workspace-icon-clear"
            onClick={() => void onWorkspaceIconClear()}
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
          onChange={(value) => void onAppearanceChange(value)}
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
          onChange={(value) => void onCloseBehaviorChange(value)}
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
            onChange={(value) => void onProxyModeChange(value)}
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
              onChange={(event) => void onProxyUrlChange(event.target.value)}
            />
          ) : null}
          {proxyMode === 'manual' ? (
            <Button
              variant="secondary"
              testId="proxy-save"
              disabled={!config}
              onClick={() => void onProxySave()}
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
              onClick={() => void onProxyDetect()}
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
          onClick={() => void onOpenDevtools()}
        >
          打开
        </Button>
      </SettingsRow>
    </div>
  )
}
