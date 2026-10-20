/** 旧数据导入（一次性）的请求/响应形状。 */

export interface LegacyImportProbe {
  legacy: boolean
  ready: boolean
  sourceDir: string
  databasePath: string
  migrationCount: number
  missingMigrations: string[]
  counts: Record<string, number>
  moneySums: Record<string, number>
  assetFiles: number
  message: string
}

export interface LegacyImportTableReport {
  table: string
  rows: number
}

export interface LegacyImportSumReport {
  table: string
  column: string
  before: number
  after: number
  ok: boolean
}

export interface LegacyImportReport {
  sourceDir: string
  targetDir: string
  sourceDigest: string
  importedAt: number
  tables: LegacyImportTableReport[]
  sums: LegacyImportSumReport[]
  assets: { copied: number; missing: string[] }
  warnings: string[]
}

export interface LegacyImportProgress {
  phase: 'probe' | 'tables' | 'assets' | 'verify' | 'done'
  table?: string
  index?: number
  total?: number
}
