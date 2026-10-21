import { DatePicker as AntDatePicker } from 'antd'
import dayjs, { type Dayjs } from 'dayjs'
import { useCallback, useState, type JSX } from 'react'

import type { DiaryExportResult } from '../../shared/types/diary'
import { Button } from '../components/button'
import { Segmented } from '../components/segmented'
import { notify } from '../components/toast'

type ExportScope = 'all' | 'year' | 'month'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

export interface DiaryTransferProps {
  ledgerId: string
}

/** 设置 · 日记配置：批量导入 / 导出。 */
export function DiaryTransfer({ ledgerId }: DiaryTransferProps): JSX.Element {
  const [scope, setScope] = useState<ExportScope>('all')
  const [period, setPeriod] = useState<Dayjs>(() => dayjs())
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')
  const [error, setError] = useState('')

  const pickDirectory = useCallback(async (title: string): Promise<string> => {
    const picked = await window.api.invoke('dialog_open', { title })
    return picked.canceled ? '' : (picked.filePaths[0] ?? '')
  }, [])

  const importDiary = useCallback(async (): Promise<void> => {
    if (!ledgerId) return
    const directory = await pickDirectory('选择日记导入目录')
    if (!directory) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const scan = await window.api.invoke('diary_import_scan', { directory })
      let imported = 0
      for (const file of scan.files) {
        try {
          await window.api.invoke('diary_import_file', {
            ledger_id: ledgerId,
            path: file.path,
            date: file.date,
          })
          imported += 1
        } catch (importError) {
          setError((current) => `${current}${current ? '\n' : ''}${file.date}: ${errorMessage(importError)}`)
        }
      }
      setStatus(`导入 ${imported}/${scan.files.length} 篇`)
      notify(`已导入 ${imported} 篇日记`)
    } catch (importError) {
      setError(errorMessage(importError))
    } finally {
      setBusy(false)
    }
  }, [ledgerId, pickDirectory])

  const exportDiary = useCallback(async (): Promise<void> => {
    if (!ledgerId) return
    const directory = await pickDirectory('选择日记导出目录')
    if (!directory) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      const result: DiaryExportResult = await window.api.invoke('diary_export', {
        ledger_id: ledgerId,
        directory,
        year: scope === 'all' ? 0 : period.year(),
        month: scope === 'month' ? period.month() + 1 : 0,
      })
      setStatus(`导出 ${result.success}/${result.total} 篇`)
      if (result.failed.length > 0) {
        setError(result.failed.map((item) => `${item.date}: ${item.error}`).join('\n'))
      }
      notify(`已导出 ${result.success} 篇日记`)
    } catch (exportError) {
      setError(errorMessage(exportError))
    } finally {
      setBusy(false)
    }
  }, [ledgerId, period, pickDirectory, scope])

  return (
    <div className="st-list">
      <div className="st-card diary-transfer-card">
        <div className="st-card-info">
          <span className="st-card-title">导入日记</span>
          <span className="st-card-desc">
            从本地目录批量导入当前账本，文件名需为 YYYY-MM-DD.txt
          </span>
        </div>
        <div className="st-card-action">
          <Button
            variant="secondary"
            testId="diary-import"
            disabled={!ledgerId || busy}
            loading={busy}
            onClick={() => void importDiary()}
          >
            批量导入
          </Button>
        </div>
      </div>

      <div className="st-card diary-transfer-card">
        <div className="st-card-info">
          <span className="st-card-title">导出日记</span>
          <span className="st-card-desc">
            把当前账本的日记导出为纯文本文件（YYYY-MM-DD.txt），可重新导入
          </span>
          <div className="st-scope-row">
            <Segmented
              testId="diary-export-scope"
              value={scope}
              onChange={(value) => setScope(value as ExportScope)}
              options={[
                { value: 'all', label: '全部' },
                { value: 'year', label: '按年' },
                { value: 'month', label: '按月' },
              ]}
            />
            {scope !== 'all' ? (
              <AntDatePicker
                className="st-scope-input"
                data-testid="diary-export-period"
                picker={scope}
                value={period}
                allowClear={false}
                onChange={(value) => {
                  if (value) setPeriod(value)
                }}
              />
            ) : null}
          </div>
        </div>
        <div className="st-card-action">
          <Button
            variant="secondary"
            testId="diary-export"
            disabled={!ledgerId || busy}
            loading={busy}
            onClick={() => void exportDiary()}
          >
            批量导出
          </Button>
        </div>
      </div>

      {error ? (
        <p className="m0-error" data-testid="diary-transfer-error">
          {error}
        </p>
      ) : null}
      {status ? (
        <p className="m0-muted" data-testid="diary-transfer-status">
          {status}
        </p>
      ) : null}
      {!ledgerId ? <p className="m0-muted">请先选择账本</p> : null}
    </div>
  )
}
