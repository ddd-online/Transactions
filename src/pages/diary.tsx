import { useCallback, useEffect, useState, type JSX } from 'react'

import type { DiaryDateItem } from '../../shared/domain/models'
import { todayYmd } from '../../shared/domain/time'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
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
      await loadDates()
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    } finally {
      setBusy(false)
    }
  }, [date, ledgerId, loadDates])

  return (
    <section className="m0-card m0-card--wide">
      <div className="m0-card-head">
        <h2>日记</h2>
        <div className="m0-actions m0-period">
          <input
            className="m0-input"
            type="date"
            data-testid="diary-date"
            value={date}
            onChange={(changeEvent) => setDate(changeEvent.target.value)}
          />
          <span className="m0-muted" data-testid="diary-word-count">
            {wordCount} 字
          </span>
        </div>
      </div>

      <div className="m0-diary-layout">
        <ul className="m0-diary-dates">
          {dates.length === 0 ? (
            <li className="m0-muted" data-testid="diary-empty">
              {ledgerId ? '还没有日记' : '请先创建/选择账本'}
            </li>
          ) : (
            dates.map((item) => (
              <li key={item.date}>
                <button
                  type="button"
                  className={item.date === date ? 'm0-primary' : 'm0-link'}
                  data-testid="diary-date-item"
                  onClick={() => setDate(item.date)}
                >
                  {item.date} · {item.wordCount} 字
                </button>
              </li>
            ))
          )}
        </ul>

        <div className="m0-diary-editor">
          <div className="m0-actions m0-new-record">
            <input
              className="m0-input"
              data-testid="diary-mood"
              placeholder="心情"
              value={mood}
              onChange={(changeEvent) => setMood(changeEvent.target.value)}
            />
            <button
              type="button"
              className="m0-primary"
              data-testid="diary-save"
              disabled={!ledgerId || busy}
              onClick={() => void save()}
            >
              保存
            </button>
            <button
              type="button"
              className="m0-link"
              data-testid="diary-delete"
              disabled={!ledgerId || busy}
              onClick={() => void remove()}
            >
              删除
            </button>
          </div>

          {error ? (
            <p className="m0-error" data-testid="diary-error">
              {error}
            </p>
          ) : null}

          <textarea
            className="m0-input m0-diary-content"
            data-testid="diary-content"
            placeholder="写点什么…"
            value={content}
            onChange={(changeEvent) => setContent(changeEvent.target.value)}
          />
        </div>
      </div>
    </section>
  )
}
