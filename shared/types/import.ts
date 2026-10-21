/** 数据导入（一次性）的请求/响应形状。 */

export interface SourceImportProbe {
  source: boolean
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

export interface SourceImportTableReport {
  table: string
  rows: number
}

export interface SourceImportSumReport {
  table: string
  column: string
  before: number
  after: number
  ok: boolean
}

export interface SourceImportReport {
  sourceDir: string
  targetDir: string
  sourceDigest: string
  importedAt: number
  tables: SourceImportTableReport[]
  sums: SourceImportSumReport[]
  assets: { copied: number; missing: string[] }
  warnings: string[]
}

export interface SourceImportProgress {
  phase: 'probe' | 'tables' | 'assets' | 'verify' | 'done'
  table?: string
  index?: number
  total?: number
}
