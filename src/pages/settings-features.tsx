/**
 * 设置 · 功能开关分栏：五个功能各一行开关（`feature-row-*` / `feature-*` 是 E2E 锚点）。
 *
 * 开关值怎么算（账本覆盖优先、没有账本用全局默认）与写回都在设置页；
 * 这里只按传进来的快照渲染，并把点击原样交回去。
 */

import { Switch as AntSwitch } from 'antd'
import type { JSX } from 'react'

import type { ConfigSnapshot, FeatureFlags } from '../../shared/types/config'

const FEATURES: ReadonlyArray<{ key: keyof FeatureFlags; title: string }> = [
  { key: 'accounting', title: '记账' },
  { key: 'stock', title: '股票' },
  { key: 'keyEvent', title: '事件' },
  { key: 'diary', title: '日记' },
  { key: 'todo', title: '待办' },
]

export interface SettingsFeaturesProps {
  /** 当前账本；为空串表示没有账本，开关写全局默认 */
  activeLedgerId: string
  config: ConfigSnapshot | null
  /** 全局默认 + 当前账本的覆盖，已在外壳里算好 */
  effectiveFeatures: FeatureFlags | null
  onFeatureChange: (feature: string, enabled: boolean) => void
}

export function SettingsFeatures({
  activeLedgerId,
  config,
  effectiveFeatures,
  onFeatureChange,
}: SettingsFeaturesProps): JSX.Element {
  return (
    <div className="st-feature-pane">
      {/* 一个开关的后果（导航里少一项、新账本沿用）不在这张表上，所以整页只说一次；
          每个开关自己不必再配一段介绍 —— 五个名字就是左侧导航的五个名字。 */}
      <div className="st-feature-hint" data-testid="feature-hint">
        {activeLedgerId
          ? '只对当前账本生效；关掉的项不显示在左侧导航。'
          : '当前没有账本：这些开关是新账本的默认值。'}
      </div>
      <div className="st-list">
        {FEATURES.map(({ key, title }) => {
          const checked = activeLedgerId
            ? (effectiveFeatures?.[key] ?? true)
            : (config?.features[key] ?? true)
          return (
            <div className="st-card" key={key} data-testid={`feature-row-${key}`}>
              <div className="st-card-info">
                <span className="st-card-title">{title}</span>
              </div>
              <div className="st-card-action">
                <AntSwitch
                  checked={checked}
                  disabled={!config}
                  data-testid={`feature-${key}`}
                  aria-label={title}
                  onChange={(next) => void onFeatureChange(key, next)}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
