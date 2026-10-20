import { AppError } from '../../shared/errors'
import type { AppConfig, FeatureFlags } from '../../shared/types/config'

const FEATURE_KEYS = ['accounting', 'stock', 'keyEvent', 'diary', 'todo'] as const
type FeatureKey = (typeof FEATURE_KEYS)[number]

function isFeatureKey(feature: string): feature is FeatureKey {
  return (FEATURE_KEYS as readonly string[]).includes(feature)
}

export function featureValue(flags: FeatureFlags, feature: string): boolean | null {
  if (!isFeatureKey(feature)) return null
  return flags[feature]
}

function setFeatureValue(flags: FeatureFlags, feature: string, enabled: boolean): void {
  if (feature === 'accounting') flags.accounting = enabled
  else if (feature === 'stock') flags.stock = enabled
  else if (feature === 'keyEvent') flags.keyEvent = enabled
  else if (feature === 'diary') flags.diary = enabled
  else if (feature === 'todo') flags.todo = enabled
}

/**
 * 按账本写一个功能开关：`ledgerId` 为空 = 改默认那份（`features`）。
 *
 * 账本第一次被改时，先按当时的默认整份复制进表再改那一项 ——
 * "这个账本只差一项"的结果可预期，而没配过的账本仍然走默认（不在表里）。
 */
export function setFeatureIn(
  config: AppConfig,
  ledgerId: string,
  feature: string,
  enabled: boolean,
): FeatureFlags {
  if (!isFeatureKey(feature)) {
    throw new AppError('无效的功能开关', { status: 400 })
  }
  if (!ledgerId) {
    setFeatureValue(config.features, feature, enabled)
    return { ...config.features }
  }
  const entry = config.ledgerFeatures[ledgerId] ?? { ...config.features }
  setFeatureValue(entry, feature, enabled)
  config.ledgerFeatures[ledgerId] = entry
  return { ...entry }
}
