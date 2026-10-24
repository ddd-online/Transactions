import { useCallback, useEffect, useMemo, useRef, useState, type JSX, type Key } from 'react'

import type { DiaryDateItem } from '../../shared/domain/models'
import { todayYmd } from '../../shared/domain/time'
import { formatYmdCn, weekdayCn } from '../../shared/domain/calendar'
import { notify } from '../components/toast'
import { Input, Popconfirm, type TreeDataNode } from 'antd'

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
  const [saveState, setSaveState] = useState<'saved' | 'dirty' | 'saving' | 'error'>('saved')
  const [expandedKeys, setExpandedKeys] = useState<string[]>([])
  const editVersion = useRef(0)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const savePromise = useRef<Promise<void> | null>(null)
  const latest = useRef({ ledgerId, date, content, mood, saveState })
  latest.current = { ledgerId, date, content, mood, saveState }

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
        setSaveState('saved')
      } catch {
        if (!alive) return
        setContent('')
        setMood('')
        setWordCount(0)
        setSaveState('saved')
      }
    })()
    return () => {
      alive = false
    }
  }, [date, ledgerId])

  const persist = useCallback((snapshot: { date: string; content: string; mood: string; version: number }): Promise<void> => {
    if (!ledgerId) return Promise.resolve()
    setSaveState('saving')
    const task = (async () => {
      try {
        const entry = await window.api.invoke('diary_upsert', {
          ledger_id: ledgerId,
          date: snapshot.date,
          content: snapshot.content,
          mood: snapshot.mood,
        })
        setDates((current) => {
          const next = current.filter((item) => item.date !== entry.date)
          next.push({ date: entry.date, wordCount: entry.wordCount, mood: entry.mood })
          return next.sort((left, right) => right.date.localeCompare(left.date))
        })
        if (snapshot.date === latest.current.date) setWordCount(entry.wordCount)
        if (snapshot.version === editVersion.current) setSaveState('saved')
      } catch (saveError) {
        setError(errorMessage(saveError))
        if (snapshot.version === editVersion.current) setSaveState('error')
      }
    })()
    savePromise.current = task
    return task
  }, [ledgerId])

  useEffect(() => {
    if (saveState !== 'dirty' || !ledgerId) return
    const version = editVersion.current
    saveTimer.current = setTimeout(() => {
      void persist({ date, content, mood, version })
    }, 600)
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
  }, [content, date, ledgerId, mood, persist, saveState])

  const changeDate = useCallback(async (next: string): Promise<void> => {
    if (!next || next === date) return
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (ledgerId && saveState === 'dirty') {
      await persist({ date, content, mood, version: editVersion.current })
    } else if (savePromise.current) {
      await savePromise.current
    }
    editVersion.current += 1
    setDate(next)
  }, [content, date, ledgerId, mood, persist, saveState])

  const changeContent = useCallback((value: string): void => {
    setContent(value)
    setError('')
    editVersion.current += 1
    setSaveState('dirty')
  }, [])

  const changeMood = useCallback((value: string): void => {
    setMood(value)
    setError('')
    editVersion.current += 1
    setSaveState('dirty')
  }, [])

  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current)
    const current = latest.current
    if (current.ledgerId && current.saveState === 'dirty') {
      void window.api.invoke('diary_upsert', {
        ledger_id: current.ledgerId,
        date: current.date,
        content: current.content,
        mood: current.mood,
      })
    }
  }, [])

  const remove = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError('')
    if (saveTimer.current) {
      clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (savePromise.current) await savePromise.current
    editVersion.current += 1
    try {
      await window.api.invoke('diary_delete', { ledger_id: ledgerId, date })
      setContent('')
      setMood('')
      setWordCount(0)
      setSaveState('saved')
      setDates((current) => current.filter((item) => item.date !== date))
      notify('日记已删除')
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    } finally {
      setBusy(false)
    }
  }, [date, ledgerId])

  const treeData = useMemo(() => buildDiaryTree(dates), [dates])

  const changeDateRef = useRef(changeDate)
  changeDateRef.current = changeDate
  const selectTree = useCallback((keys: Key[]) => {
    const next = String(keys[0] ?? '')
    if (/^\d{4}-\d{2}-\d{2}$/.test(next)) void changeDateRef.current(next)
  }, [])

  const expandTree = useCallback((keys: Key[]) => setExpandedKeys(keys.map(String)), [])

  return (
    <PageLayout
      contentClassName="diary-page-content"
      toolbar={<>
              <div className="m0-actions">
                <Button variant="secondary" onClick={() => void changeDate(todayYmd())}>
                  今天
                </Button>
                <DatePicker testId="diary-date" value={date} onChange={(value) => void changeDate(value)} />
              </div>
              <div className="m0-actions">
                <span className={`diary-save-state is-${saveState}`} data-testid="diary-save-state">
                  {saveState === 'saving'
                    ? '保存中…'
                    : saveState === 'dirty'
                      ? '未保存'
                      : saveState === 'error'
                        ? '保存失败'
                        : '已保存'}
                </span>
                <Popconfirm
                  title="删除这篇日记？"
                  okText="确认删除"
                  okType="danger"
                  cancelText="取消"
                  placement="bottomRight"
                  disabled={!ledgerId || busy}
                  onConfirm={() => void remove()}
                >
                  <Button
                    variant="danger-outline"
                    testId="diary-delete"
                    disabled={!ledgerId || busy}
                  >
                    删除
                  </Button>
                </Popconfirm>
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
                  <MoodPicker value={mood} onChange={changeMood} />
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
                    onChange={(changeEvent) => changeContent(changeEvent.target.value)}
                  />
                </div>
              </section>
            </div>
    </PageLayout>
  )
}
