/**
 * 设置 · 功能开关分栏：五个功能各一行开关（`feature-row-*` / `feature-*` 是 E2E 锚点）。
 *
 * 开关值怎么算（账本覆盖优先、没有账本用全局默认）与写回都在设置页；
 * 这里只按传进来的快照渲染，并把点击原样交回去。
 */

import { Switch as AntSwitch } from 'antd'
import type { JSX } from 'react'

import type { ConfigSnapshot, FeatureFlags } from '../../shared/types/config'

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
