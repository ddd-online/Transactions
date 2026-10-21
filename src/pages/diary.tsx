import { useCallback, useEffect, useMemo, useState, type JSX, type Key } from 'react'

import type { DiaryDateItem } from '../../shared/domain/models'
import { todayYmd } from '../../shared/domain/time'
import { formatYmdCn, weekdayCn } from '../../shared/domain/calendar'
import { notify } from '../components/toast'
import { Input, type TreeDataNode } from 'antd'

import { Button } from '../components/button'
import { DatePicker } from '../components/date-picker'
import { DiaryTree } from '../components/diary-tree'
import { PageLayout } from '../components/page-layout'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function buildDiaryTree(dates: DiaryDateItem[]): TreeDataNode[] {
  const years = new Map<string, Map<string, DiaryDateItem[]>>()
  for (const item of dates) {
    const year = item.date.slice(0, 4)
    const month = item.date.slice(0, 7)
    const months = years.get(year) ?? new Map<string, DiaryDateItem[]>()
    const items = months.get(month) ?? []
    items.push(item)
    months.set(month, items)
    years.set(year, months)
  }

  return [...years.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([year, months]) => {
      const monthNodes = [...months.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([month, items]) => ({
          key: month,
          title: (
            <span className="diary-tree-month">
              {Number(month.slice(5))}月
              <span className="diary-tree-count">{items.length}</span>
            </span>
          ),
          children: items
            .slice()
            .sort((left, right) => right.date.localeCompare(left.date))
            .map((item) => ({
              key: item.date,
              isLeaf: true,
              title: (
                <span className="diary-tree-date" data-testid="diary-date-item">
                  <span>{item.date}</span>
                  <span className="m0-muted">{item.wordCount} 字</span>
                </span>
              ),
            })),
        }))

      const count = [...months.values()].reduce((sum, items) => sum + items.length, 0)
      return {
        key: `year-${year}`,
        title: (
          <span className="diary-tree-year">
            {year}年
            <span className="diary-tree-count">{count}</span>
          </span>
        ),
        children: monthNodes,
      }
    })
}

export interface DiaryPageProps {
  ledgerId: string
}

export function DiaryPage({ ledgerId }: DiaryPageProps): JSX.Element {
  const [dates, setDates] = useState<DiaryDateItem[]>([])
  const [date, setDate] = useState(todayYmd())
  const [content, setContent] = useState('')
  const [mood, setMood] = useState('')
  const [wordCount, setWordCount] = useState(0)
  const [directory, setDirectory] = useState('')
  const [transferStatus, setTransferStatus] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])

  const loadDates = useCallback(async (): Promise<void> => {
    if (!ledgerId) {
      setDates([])
      return
    }
    try {
      const rows = await window.api.invoke('diary_list_dates', { ledger_id: ledgerId })
      setDates(rows)
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [ledgerId])

  useEffect(() => {
    void loadDates()
  }, [loadDates])

  useEffect(() => {
    const pathOf = (ymd: string): string[] => [
      `year-${ymd.slice(0, 4)}`,
      ymd.slice(0, 7),
    ]
    const paths = new Set<string>()
    if (dates.some((item) => item.date === date)) {
      for (const key of pathOf(date)) paths.add(key)
    }
    const newest = dates[0]?.date
    if (newest) for (const key of pathOf(newest)) paths.add(key)
    setExpandedKeys((current) => [...new Set([...current, ...paths])])
  }, [date, dates])

  useEffect(() => {
    let alive = true
    if (!ledgerId || !date) {
      setContent('')
      setMood('')
      setWordCount(0)
      return
    }
    void (async () => {
      try {
        const entry = await window.api.invoke('diary_get', { ledger_id: ledgerId, date })
        if (!alive) return
        setContent(entry.content)
        setMood(entry.mood)
        setWordCount(entry.wordCount)
      } catch {
        if (!alive) return
        setContent('')
        setMood('')
        setWordCount(0)
      }
    })()
    return () => {
      alive = false
    }
  }, [date, ledgerId])

  const save = useCallback(async (): Promise<void> => {
    if (!ledgerId) return
    setBusy(true)
    setError('')
    try {
      const entry = await window.api.invoke('diary_upsert', {
        ledger_id: ledgerId,
        date,
        content,
        mood,
      })
      setWordCount(entry.wordCount)
      notify('日记已保存')
      await loadDates()
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }, [content, date, ledgerId, loadDates, mood])

  const pickDirectory = useCallback(async (): Promise<void> => {
    const picked = await window.api.invoke('dialog_open', { title: '选择日记目录' })
    if (!picked.canceled && picked.filePaths[0]) setDirectory(picked.filePaths[0])
  }, [])

  const exportDiary = useCallback(async (): Promise<void> => {
    if (!ledgerId || !directory) return
    setBusy(true)
    setError('')
    try {
      const result = await window.api.invoke('diary_export', {
        ledger_id: ledgerId,
        directory,
        year: null,
        month: null,
      })
      setTransferStatus(`导出 ${result.success}/${result.total} 篇`)
      if (result.failed.length > 0) {
        setError(result.failed.map((item) => `${item.date}: ${item.error}`).join('\n'))
      }
    } catch (exportError) {
      setError(errorMessage(exportError))
    } finally {
      setBusy(false)
    }
  }, [directory, ledgerId])

  const importDiary = useCallback(async (): Promise<void> => {
    if (!ledgerId || !directory) return
    setBusy(true)
    setError('')
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
          setError((current) =>
            `${current}${current ? '\n' : ''}${file.date}: ${errorMessage(importError)}`,
          )
        }
      }
      setTransferStatus(`导入 ${imported}/${scan.files.length} 篇`)
      await loadDates()
    } catch (importError) {
      setError(errorMessage(importError))
    } finally {
      setBusy(false)
    }
  }, [directory, ledgerId, loadDates])

  const remove = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await window.api.invoke('diary_delete', { ledger_id: ledgerId, date })
      setContent('')
      setMood('')
      setWordCount(0)
      notify('日记已删除')
      await loadDates()
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    } finally {
      setBusy(false)
    }
  }, [date, ledgerId, loadDates])

  const treeData = useMemo(() => buildDiaryTree(dates), [dates])

  const selectTree = useCallback((keys: Key[]) => {
    const next = String(keys[0] ?? '')
    if (/^\d{4}-\d{2}-\d{2}$/.test(next)) setDate(next)
  }, [])

  const expandTree = useCallback((keys: Key[]) => setExpandedKeys(keys.map(String)), [])

  return (
    <PageLayout
      toolbar={<>
              <div className="m0-actions">
                <Button variant="secondary" onClick={() => setDate(todayYmd())}>
                  今天
                </Button>
                <DatePicker testId="diary-date" value={date} onChange={(value) => setDate(value)} />
              </div>
              <div className="m0-actions">
                <Button
                  variant="primary"
                  testId="diary-save"
                  disabled={!ledgerId || busy}
                  onClick={() => void save()}
                >
                  保存
                </Button>
                <Button
                  variant="text"
                  testId="diary-delete"
                  disabled={!ledgerId || busy}
                  onClick={() => void remove()}
                >
                  删除
                </Button>
              </div>
      </>}
    >

            {error ? (
              <p className="m0-error" data-testid="diary-error">
                {error}
              </p>
            ) : null}

            <div className="diary-layout">
              <aside className="diary-list">
                <div className="diary-list-head">
                  <strong>日记列表</strong>
                  <span className="m0-muted">{dates.length} 篇</span>
                </div>
                {dates.length === 0 ? (
                  <p className="m0-muted" data-testid="diary-empty">
                    {ledgerId ? '还没有日记' : '请先创建/选择账本'}
                  </p>
                ) : (
                  <DiaryTree
                    nodes={treeData}
                    selectedDate={date}
                    expandedKeys={expandedKeys}
                    onExpand={expandTree}
                    onSelect={selectTree}
                  />
                )}
              </aside>

              <section className="diary-editor">
                <div className="diary-editor-head">
                  <h2>
                    {formatYmdCn(date)} <span className="m0-muted">{weekdayCn(date)}</span>
                  </h2>
                  <Input
                    data-testid="diary-mood"
                    placeholder="心情"
                    value={mood}
                    onChange={(changeEvent) => setMood(changeEvent.target.value)}
                  />
                  <span className="m0-muted" data-testid="diary-word-count">
                    {wordCount} 字
                  </span>
                </div>

                <Input.TextArea
                  className="m0-diary-content"
                  data-testid="diary-content"
                  placeholder="写下今天的日记……"
                  value={content}
                  onChange={(changeEvent) => setContent(changeEvent.target.value)}
                />

                <div className="diary-io">
                  <label className="m0-field">
                    导入 / 导出目录
                    <Input
                      data-testid="diary-dir"
                      value={directory}
                      onChange={(event) => setDirectory(event.target.value)}
                      placeholder="包含 YYYY-MM-DD.txt 的目录"
                    />
                  </label>
                  <Button variant="text" onClick={() => void pickDirectory()}>
                    选择
                  </Button>
                  <Button
                    variant="text"
                    testId="diary-import"
                    disabled={!directory || busy}
                    onClick={() => void importDiary()}
                  >
                    导入目录
                  </Button>
                  <Button
                    variant="text"
                    testId="diary-export"
                    disabled={!directory || busy}
                    onClick={() => void exportDiary()}
                  >
                    导出全部
                  </Button>
                  {transferStatus ? (
                    <span className="m0-muted" data-testid="diary-transfer-status">
                      {transferStatus}
                    </span>
                  ) : null}
                </div>
              </section>
            </div>
    </PageLayout>
  )
}
