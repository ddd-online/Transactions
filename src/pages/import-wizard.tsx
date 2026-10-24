import { useCallback, useState, type JSX } from 'react'

import { Input } from 'antd'

import { Button } from '../components/button'
import { SettingsRow } from '../components/settings-row'
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
    <div className="st-list">
      <SettingsRow
        title="源目录"
        description="包含 transactions.db 的工作空间目录；只读，不会修改源库"
      >
        <Input
          className="st-import-path"
          data-testid="import-source"
          aria-label="源目录"
          value={sourceDir}
          onChange={(event) => setSourceDir(event.target.value)}
          placeholder="包含 transactions.db 的目录"
        />
        <Button variant="secondary" onClick={() => void pick(setSourceDir)}>
          选择
        </Button>
      </SettingsRow>

      <SettingsRow title="新目录" description="导入到空目录；目录不存在会自动创建">
        <Input
          className="st-import-path"
          data-testid="import-target"
          aria-label="新目录"
          value={targetDir}
          onChange={(event) => setTargetDir(event.target.value)}
          placeholder="空目录"
        />
        <Button variant="secondary" onClick={() => void pick(setTargetDir)}>
          选择
        </Button>
      </SettingsRow>

      <SettingsRow
        title="执行导入"
        description="先检查源库，确认可导入后开始；完成后写入 import-report.json"
      >
        <Button
          variant="secondary"
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
      </SettingsRow>

      {progress ? (
        <div className="st-card st-card--block">
          <span className="st-card-desc" data-testid="import-status">
            {busy ? <Spin /> : null}
            {PHASE_LABELS[progress.phase] ?? progress.phase}
            {progress.table ? ` · ${progress.table}` : ''}
            {typeof progress.index === 'number' && progress.total
              ? ` (${progress.index}/${progress.total})`
              : ''}
          </span>
        </div>
      ) : null}

      {error ? (
        <p className="m0-error" data-testid="import-error">
          {error}
        </p>
      ) : null}

      {probe ? (
        <div className="st-card st-card--block" data-testid="import-probe-result">
          <span className="st-card-title">源库检查</span>
          <p className={probe.ready ? 'st-card-desc' : 'm0-error'}>{probe.message}</p>
          <p className="st-card-desc">
            迁移 {probe.migrationCount} 条 · 资产 {probe.assetFiles} 个 · 缺失{' '}
            {probe.missingMigrations.length} 条
          </p>
          <ul className="st-card-desc">
            {Object.entries(probe.counts).map(([table, count]) => (
              <li key={table}>
                {table}: {count}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {report ? (
        <div className="st-card st-card--block" data-testid="import-report">
          <span className="st-card-title">导入完成</span>
          <p className="st-card-desc">
            共 {report.tables.reduce((sum, table) => sum + table.rows, 0)} 行 · 资产复制{' '}
            {report.assets.copied} 个 · 警告 {report.warnings.length} 条
          </p>
        </div>
      ) : null}
    </div>
  )
}



