/** 数据导入（一次性）的请求/响应形状。 */

export interface CompatImportProbe {
  compat: boolean
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

export interface CompatImportTableReport {
  table: string
  rows: number
}

export interface CompatImportSumReport {
  table: string
  column: string
  before: number
  after: number
  ok: boolean
}

export interface CompatImportReport {
  sourceDir: string
  targetDir: string
  sourceDigest: string
  importedAt: number
  tables: CompatImportTableReport[]
  sums: CompatImportSumReport[]
  assets: { copied: number; missing: string[] }
  warnings: string[]
}

export interface CompatImportProgress {
  phase: 'probe' | 'tables' | 'assets' | 'verify' | 'done'
  table?: string
  index?: number
  total?: number
}
