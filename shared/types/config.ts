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
  /** 分析页右侧「曲线合计」是否收起；true = 只留窄条。 */
  chartSummaryCollapsed: boolean
  dataVersion: number
  /** 备份位置；空串 = 「文档」下的默认目录 */
  backupDir: string
  /** 每天第一次打开工作空间时另存一份当日快照 */
  autoBackup: boolean
  /** 最近成功打开过的工作空间，最新的在前，最多 5 条 */
  recentWorkspaces: string[]
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
  chartSummaryCollapsed: boolean
  /** 解析后的绝对路径（永远非空）；raw 里的 `backupDir` 可能是空串 */
  backupDir: string
  autoBackup: boolean
  recentWorkspaces: string[]
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
