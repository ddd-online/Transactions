export interface ProxySetting {
  /** off / auto / manual */
  mode: string
  url: string
}

export interface FeatureFlags {
  accounting: boolean
  stock: boolean
  keyEvent: boolean
  diary: boolean
  todo: boolean
}

export type LedgerFeatures = Record<string, FeatureFlags>

export interface AppConfig {
  width: number
  height: number
  x: number | null
  y: number | null
  workspaceDir: string
  closeBehavior: string
  appearance: string
  proxy: ProxySetting
  features: FeatureFlags
  ledgerFeatures: LedgerFeatures
  keyEventLinkedOpen: boolean
  sidebarCollapsed: boolean
  dataVersion: number
}

export interface ConfigSnapshot {
  workspaceDir: string
  closeBehavior: string
  appearance: string
  configPath: string
  isDev: boolean
  proxy: ProxySetting
  features: FeatureFlags
  ledgerFeatures: LedgerFeatures
  keyEventLinkedOpen: boolean
  sidebarCollapsed: boolean
}

export interface DialogOpenResponse {
  canceled: boolean
  filePaths: string[]
  error?: string
}

export function defaultFeatures(): FeatureFlags {
  return {
    accounting: true,
    stock: true,
    keyEvent: true,
    diary: true,
    todo: true,
  }
}

export function defaultProxy(): ProxySetting {
  return { mode: 'auto', url: '' }
}
