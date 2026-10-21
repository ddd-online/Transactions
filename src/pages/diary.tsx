import { useCallback, useEffect, useMemo, useState, type JSX, type Key } from 'react'

import type { DiaryDateItem } from '../../shared/domain/models'
import { todayYmd } from '../../shared/domain/time'
import { formatYmdCn, weekdayCn } from '../../shared/domain/calendar'
import { notify } from '../components/toast'
import { Input, type TreeDataNode } from 'antd'

import { Button } from '../components/button'
import { DatePicker } from '../components/date-picker'
import { DiaryTree } from '../components/diary-tree'
import { MoodPicker, normalizeMood } from '../components/mood-picker'
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
            <span className="diary-tree-group">
              <span>{Number(month.slice(5))}月</span>
              <span className="diary-tree-count">{items.length}篇</span>
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
                  <span className="diary-tree-day">
                    <span className="sr-only">{item.date}</span>
                    {Number(item.date.slice(8))}
                  </span>
                  <span className="diary-tree-meta">
                    {normalizeMood(item.mood) ? (
                      <span className="diary-tree-mood">{normalizeMood(item.mood)}</span>
                    ) : null}
                    <span className="m0-muted">{item.wordCount}字</span>
                  </span>
                </span>
              ),
            })),
        }))

      const count = [...months.values()].reduce((sum, items) => sum + items.length, 0)
      return {
        key: `year-${year}`,
        title: (
          <span className="diary-tree-group diary-tree-year">
            <span>{year}年</span>
            <span className="diary-tree-count">{count}篇</span>
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
      contentClassName="diary-page-content"
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
                  variant="text-danger"
                  testId="diary-delete"
                  disabled={!ledgerId || busy}
                  onClick={() => void remove()}
                >
                  删除
                </Button>
              </div>
      </>}
    >

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
                {error ? (
                  <p className="m0-error" data-testid="diary-error">
                    {error}
                  </p>
                ) : null}
                <div className="diary-editor-head">
                  <h2>
                    {formatYmdCn(date)} <span className="m0-muted">{weekdayCn(date)}</span>
                  </h2>
                  <MoodPicker value={mood} onChange={setMood} />
                  <span className="m0-muted" data-testid="diary-word-count">
                    {wordCount}字
                  </span>
                </div>

                <div className="diary-content-card">
                  <Input.TextArea
                    className="m0-diary-content"
                    data-testid="diary-content"
                    placeholder="写下今天的日记……"
                    value={content}
                    onChange={(changeEvent) => setContent(changeEvent.target.value)}
                  />
                </div>
              </section>
            </div>
    </PageLayout>
  )
}
