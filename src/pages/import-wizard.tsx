import { useCallback, useState, type JSX } from 'react'

import { Input } from 'antd'

import { Button } from '../components/button'
import { notify } from '../components/toast'
import { Spin } from '../components/spin'
import type {
  SourceImportProbe,
  SourceImportProgress,
  SourceImportReport,
} from '../../shared/types/import'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

const PHASE_LABELS: Record<string, string> = {
  probe: '检查源库',
  tables: '复制数据表',
  assets: '复制资产',
  verify: '核对金额',
  done: '完成',
}

export interface ImportWizardProps {
  progress: SourceImportProgress | null
  onImported: (targetDir: string) => Promise<void>
}

/** 从既有工作空间导入账本、业务数据与资产。 */
export function ImportWizard({ progress, onImported }: ImportWizardProps): JSX.Element {
  const [sourceDir, setSourceDir] = useState('')
  const [targetDir, setTargetDir] = useState('')
  const [probe, setProbe] = useState<SourceImportProbe | null>(null)
  const [report, setReport] = useState<SourceImportReport | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const pick = useCallback(async (setter: (value: string) => void): Promise<void> => {
    const picked = await window.api.invoke('dialog_open', { title: '选择目录' })
    if (!picked.canceled && picked.filePaths[0]) setter(picked.filePaths[0])
  }, [])

  const check = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError('')
    setReport(null)
    try {
      const result = await window.api.invoke('source_import_probe', { workspaceDir: sourceDir })
      setProbe(result)
    } catch (probeError) {
      setProbe(null)
      setError(errorMessage(probeError))
    } finally {
      setBusy(false)
    }
  }, [sourceDir])

  const start = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError('')
    setReport(null)
    try {
      const result = await window.api.invoke('source_import_start', { sourceDir, targetDir })
      setReport(result)
      notify('数据导入完成')
      await onImported(targetDir)
    } catch (importError) {
      setError(errorMessage(importError))
    } finally {
      setBusy(false)
    }
  }, [onImported, sourceDir, targetDir])

  return (
    <section className="m0-card m0-card--wide st-import-card">
      <h2>导入数据</h2>
      <p className="m0-muted">
        选择包含 transactions.db 的源目录，导入到空目录；源库只读，完成后写入 import-report.json。
      </p>

      <div className="m0-import-row">
        <label className="m0-field m0-import-field">
          源目录
          <Input
            data-testid="import-source"
            value={sourceDir}
            onChange={(event) => setSourceDir(event.target.value)}
            placeholder="包含 transactions.db 的目录"
          />
        </label>
        <Button variant="text" onClick={() => void pick(setSourceDir)}>
          选择
        </Button>
      </div>

      <div className="m0-import-row">
        <label className="m0-field m0-import-field">
          新目录
          <Input
            data-testid="import-target"
            value={targetDir}
            onChange={(event) => setTargetDir(event.target.value)}
            placeholder="空目录（不存在会自动创建）"
          />
        </label>
        <Button variant="text" onClick={() => void pick(setTargetDir)}>
          选择
        </Button>
      </div>

      <div className="m0-actions">
        <Button
          variant="primary"
          testId="import-probe"
          disabled={!sourceDir || busy}
          onClick={() => void check()}
        >
          检查源库
        </Button>
        <Button
          variant="primary"
          testId="import-start"
          disabled={!sourceDir || !targetDir || !probe?.ready || busy}
          onClick={() => void start()}
        >
          开始导入
        </Button>
        {progress ? (
          <span className="m0-muted" data-testid="import-status">
            {busy ? <Spin /> : null}
            {PHASE_LABELS[progress.phase] ?? progress.phase}
            {progress.table ? ` · ${progress.table}` : ''}
            {typeof progress.index === 'number' && progress.total
              ? ` (${progress.index}/${progress.total})`
              : ''}
          </span>
        ) : null}
      </div>

      {error ? (
        <p className="m0-error" data-testid="import-error">
          {error}
        </p>
      ) : null}

      {probe ? (
        <div className="m0-import-probe" data-testid="import-probe-result">
          <p className={probe.ready ? 'm0-muted' : 'm0-error'}>{probe.message}</p>
          <p className="m0-muted">
            迁移 {probe.migrationCount} 条 · 资产 {probe.assetFiles} 个 · 缺失{' '}
            {probe.missingMigrations.length} 条
          </p>
          <ul className="m0-muted">
            {Object.entries(probe.counts).map(([table, count]) => (
              <li key={table}>
                {table}: {count}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report ? (
        <div className="m0-import-report" data-testid="import-report">
          <p>导入完成：{report.tables.reduce((sum, table) => sum + table.rows, 0)} 行</p>
          <p className="m0-muted">
            资产复制 {report.assets.copied} 个 · 警告 {report.warnings.length} 条
          </p>
        </div>
      ) : null}
    </section>
  )
}



