import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import type { KeyEvent, KeyEventImage } from '../../shared/domain/models'
import { todayYmd } from '../../shared/domain/time'
import { ImageCrop } from '../components/image-crop'
import { DatePicker } from '../components/date-picker'
import { Tooltip } from '../components/tooltip'
import { Icon } from '../components/icon'
import { Markdown } from '../components/markdown'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
}

function thumbUrl(relativePath: string): string {
  return `trasset://local/${relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
}

async function makeThumbnail(dataUrl: string): Promise<string> {
  const image = new Image()
  image.src = dataUrl
  await image.decode()
  const width = Math.min(300, image.naturalWidth || 300)
  const height = Math.max(1, Math.round((image.naturalHeight * width) / image.naturalWidth))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')
  if (!context) throw new Error('无法创建缩略图画布')
  context.drawImage(image, 0, 0, width, height)
  return canvas.toDataURL('image/jpeg', 0.75)
}

function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

export interface EventsPageProps {
  ledgerId: string
}

export function EventsPage({ ledgerId }: EventsPageProps): JSX.Element {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [date, setDate] = useState(todayYmd())
  const [events, setEvents] = useState<KeyEvent[]>([])
  const [event, setEvent] = useState<KeyEvent | null>(null)
  const [images, setImages] = useState<KeyEventImage[]>([])
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [color, setColor] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cropSrc, setCropSrc] = useState('')
  const fileRef = useRef<HTMLInputElement | null>(null)

  const loadDates = useCallback(async (): Promise<void> => {
    if (!ledgerId || !year) return
    try {
      const rows = await window.api.invoke('key_event_list_by_year', {
        ledger_id: ledgerId,
        year,
      })
      setEvents(rows)
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [ledgerId, year])

  const loadEvent = useCallback(async (): Promise<void> => {
    if (!ledgerId || !date) return
    try {
      const row = await window.api.invoke('key_event_get', { ledger_id: ledgerId, date })
      setEvent(row)
      setTitle(row.title)
      setContent(row.content)
      setColor(row.color)
    } catch {
      setEvent(null)
      setTitle('')
      setContent('')
      setColor('')
    }
    try {
      const rows = await window.api.invoke('key_event_images_list', {
        ledger_id: ledgerId,
        date,
      })
      setImages(rows)
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [date, ledgerId])

  useEffect(() => {
    void loadDates()
  }, [loadDates])

  useEffect(() => {
    void loadEvent()
  }, [loadEvent])

  const save = useCallback(async (): Promise<void> => {
    if (!ledgerId) return
    setBusy(true)
    setError('')
    try {
      await window.api.invoke('key_event_upsert', {
        ledger_id: ledgerId,
        date,
        title,
        content,
        color,
      })
      await Promise.all([loadEvent(), loadDates()])
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }, [color, content, date, ledgerId, loadDates, loadEvent, title])

  const remove = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError('')
    try {
      await window.api.invoke('key_event_delete', { ledger_id: ledgerId, date })
      setEvent(null)
      setTitle('')
      setContent('')
      setColor('')
      setImages([])
      await loadDates()
    } catch (deleteError) {
      setError(errorMessage(deleteError))
    } finally {
      setBusy(false)
    }
  }, [date, ledgerId, loadDates])

  const addImage = useCallback(async (file: File | undefined): Promise<void> => {
    if (!file || !ledgerId) return
    setError('')
    try {
      setCropSrc(await readDataUrl(file))
    } catch (readError) {
      setError(errorMessage(readError))
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [ledgerId])

  const commitImage = useCallback(
    async (data: string): Promise<void> => {
      setBusy(true)
      setError('')
      try {
        if (!event) {
          await window.api.invoke('key_event_upsert', {
            ledger_id: ledgerId,
            date,
            title,
            content,
            color,
          })
        }
        const thumb = await makeThumbnail(data)
        await window.api.invoke('key_event_image_add', {
          ledger_id: ledgerId,
          date,
          data,
          thumb,
        })
        setCropSrc('')
        await Promise.all([loadEvent(), loadDates()])
      } catch (imageError) {
        setError(errorMessage(imageError))
      } finally {
        setBusy(false)
      }
    },
    [color, content, date, event, ledgerId, loadDates, loadEvent, title],
  )

  const removeImage = useCallback(
    async (id: string): Promise<void> => {
      setError('')
      try {
        await window.api.invoke('key_event_image_delete', { id })
        await loadEvent()
      } catch (imageError) {
        setError(errorMessage(imageError))
      }
    },
    [loadEvent],
  )

  return (
        <section className="page">
          <div className="page-region">
            <div className="page-main">
              <div className="page-content">
                <div className="page-toolbar">
                  <div className="m0-actions">
                    <button
                      type="button"
                      className="ui-btn ui-btn--text"
                      onClick={() => setYear(String(Number(year) - 1))}
                    >
                      <Icon name="Left" size={16} />
                    </button>
                    <strong className="event-year-label">{year}</strong>
                    <button
                      type="button"
                      className="ui-btn ui-btn--text"
                      onClick={() => setYear(String(Number(year) + 1))}
                    >
                      <Icon name="Right" size={16} />
                    </button>
                  </div>
                  <DatePicker
                    testId="event-date"
                    value={date}
                    onChange={(value) => setDate(value)}
                  />
                </div>

                {error ? (
                  <p className="m0-error" data-testid="event-error">
                    {error}
                  </p>
                ) : null}

                <div className="events-layout">
                  <aside className="events-list">
                    {events.length === 0 ? (
                      <p className="m0-muted">这一年还没有事件</p>
                    ) : (
                      events.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`event-card${item.date === date ? ' is-active' : ''}`}
                          data-testid="event-date-item"
                          onClick={() => setDate(item.date)}
                        >
                          <strong>{item.title || '未命名事件'}</strong>
                          <span className="m0-muted">{item.date}</span>
                          <span className="event-card-excerpt">
                            {item.content.replace(/\s+/g, ' ').slice(0, 60) || '（无正文）'}
                          </span>
                        </button>
                      ))
                    )}
                    <button
                      type="button"
                      className="ui-btn ui-btn--primary"
                      onClick={() => {
                        const today = todayYmd()
                        setYear(today.slice(0, 4))
                        setDate(today)
                        setTitle('')
                        setContent('')
                        setColor('')
                      }}
                    >
                      新增事件
                    </button>
                  </aside>

                  <section className="events-editor">
                    <div className="events-editor-head">
                      <input
                        className="m0-input"
                        data-testid="event-title"
                        placeholder="事件标题"
                        value={title}
                        onChange={(changeEvent) => setTitle(changeEvent.target.value)}
                      />
                      <input
                        className="m0-input"
                        data-testid="event-color"
                        placeholder="颜色"
                        value={color}
                        onChange={(changeEvent) => setColor(changeEvent.target.value)}
                      />
                      <button
                        type="button"
                        className="ui-btn ui-btn--primary"
                        data-testid="event-save"
                        disabled={!ledgerId || busy}
                        onClick={() => void save()}
                      >
                        保存
                      </button>
                      <button
                        type="button"
                        className="ui-btn ui-btn--text"
                        data-testid="event-delete"
                        disabled={!event || busy}
                        onClick={() => void remove()}
                      >
                        删除
                      </button>
                    </div>

                    <textarea
                      className="m0-input m0-event-content"
                      data-testid="event-content"
                      placeholder="写下这件事……"
                      value={content}
                      onChange={(changeEvent) => setContent(changeEvent.target.value)}
                    />
                    {content ? <Markdown source={content} testId="event-content-preview" /> : null}

                    <div className="m0-actions">
                      <input
                        ref={fileRef}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        data-testid="event-image-input"
                        onChange={(changeEvent) => void addImage(changeEvent.target.files?.[0])}
                      />
                    </div>

                    <div className="m0-event-images">
                      {images.map((image) => (
                        <figure key={image.id} className="m0-event-image">
                          <img src={thumbUrl(image.thumbPath)} alt="事件图片" data-testid="event-image" />
                          <Tooltip text="删除这张图片">
                            <button
                              type="button"
                              className="m0-link"
                              data-testid="event-image-delete"
                              onClick={() => void removeImage(image.id)}
                            >
                              删除图片
                            </button>
                          </Tooltip>
                        </figure>
                      ))}
                    </div>
                  </section>
                </div>

                {cropSrc ? (
                  <ImageCrop
                    src={cropSrc}
                    onCancel={() => setCropSrc('')}
                    onConfirm={(data) => void commitImage(data)}
                  />
                ) : null}
              </div>
            </div>
          </div>
        </section>
  )
}







