import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
} from 'react'
import { Input, Modal } from 'antd'

import type { KeyEvent, KeyEventImage } from '../../shared/domain/models'
import type { TransactionRecordDto } from '../../shared/types/transaction'
import { centsToYuan } from '../../shared/domain/money'
import { todayYmd } from '../../shared/domain/time'
import { Button } from '../components/button'
import { DatePicker } from '../components/date-picker'
import { FileButton } from '../components/file-button'
import { Icon } from '../components/icon'
import { ImageCrop } from '../components/image-crop'
import { PageLayout } from '../components/page-layout'
import { ScrollArea } from '../components/scroll-area'
import { TimeRangePicker } from '../components/time-range-picker'

const EVENT_COLORS: Array<[string, string]> = [
  ['#D9705A', '砖红'],
  ['#C25460', '玫红'],
  ['#D07048', '橘红'],
  ['#D48838', '橘黄'],
  ['#C6963A', '土黄'],
  ['#A09040', '橄榄黄'],
  ['#5C9858', '草绿'],
  ['#4A8E70', '松绿'],
  ['#5C9E7C', '豆绿'],
  ['#3D8878', '墨绿'],
  ['#389098', '青蓝'],
  ['#4A78A0', '钢蓝'],
  ['#5C8DB5', '天蓝'],
  ['#6070A0', '靛蓝'],
  ['#7868A0', '蓝紫'],
  ['#8C6B9E', '紫罗兰'],
  ['#A06088', '紫红'],
  ['#B06078', '胭脂'],
  ['#8C7B6E', '茶褐'],
  ['#7E8890', '青灰'],
]

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

function shortDate(date: string): string {
  return date.length >= 10 ? date.slice(5) : date
}

function summaryOf(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 30)
}

function signedAmount(row: TransactionRecordDto): string {
  const sign = row.transactionType === 'expense' ? '-' : row.transactionType === 'income' ? '+' : ''
  return `${sign}¥${centsToYuan(row.price)}`
}

export interface EventsPageProps {
  ledgerId: string
}

export function EventsPage({ ledgerId }: EventsPageProps): JSX.Element {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [date, setDate] = useState('')
  const [events, setEvents] = useState<KeyEvent[]>([])
  const [event, setEvent] = useState<KeyEvent | null>(null)
  const [images, setImages] = useState<KeyEventImage[]>([])
  const [linked, setLinked] = useState<TransactionRecordDto[]>([])
  const [linksOpen, setLinksOpen] = useState(true)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [color, setColor] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [cropSrc, setCropSrc] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [addDate, setAddDate] = useState(todayYmd())
  const [addTitle, setAddTitle] = useState('')
  const [addBusy, setAddBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)

  const clearSelection = useCallback((): void => {
    setDate('')
    setEvent(null)
    setImages([])
    setLinked([])
    setTitle('')
    setContent('')
    setColor('')
  }, [])

  const loadDates = useCallback(async (): Promise<void> => {
    if (!ledgerId || !year) {
      setEvents([])
      return
    }
    try {
      const rows = await window.api.invoke('key_event_list_by_year', {
        ledger_id: ledgerId,
        year,
      })
      setEvents([...rows].sort((left, right) => right.date.localeCompare(left.date)))
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [ledgerId, year])

  const loadEvent = useCallback(async (): Promise<void> => {
    if (!ledgerId || !date) {
      setEvent(null)
      setImages([])
      setTitle('')
      setContent('')
      setColor('')
      return
    }
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

  useEffect(() => {
    let alive = true
    if (!ledgerId || !date) {
      setLinked([])
      return
    }
    void (async () => {
      try {
        const result = await window.api.invoke('tr_query', {
          ledgerId,
          offset: 0,
          limit: 500,
          tsRange: [],
          items: [],
          sortFields: [{ field: 'transactionAt', order: 'desc' }],
        })
        if (alive) setLinked(result.items.filter((row) => row.keyEventDate === date))
      } catch {
        if (alive) setLinked([])
      }
    })()
    return () => {
      alive = false
    }
  }, [date, ledgerId])

  const save = useCallback(async (): Promise<void> => {
    if (!ledgerId || !date) return
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

  const removeEvent = useCallback(
    async (targetDate: string): Promise<void> => {
      if (!ledgerId || !targetDate) return
      setBusy(true)
      setError('')
      try {
        await window.api.invoke('key_event_delete', { ledger_id: ledgerId, date: targetDate })
        if (date === targetDate) clearSelection()
        await loadDates()
      } catch (deleteError) {
        setError(errorMessage(deleteError))
      } finally {
        setBusy(false)
      }
    },
    [clearSelection, date, ledgerId, loadDates],
  )

  const openAdd = useCallback((): void => {
    const today = todayYmd()
    setAddDate(date || (today.startsWith(year) ? today : `${year}-01-01`))
    setAddTitle('')
    setAddOpen(true)
  }, [date, year])

  const createEvent = useCallback(async (): Promise<void> => {
    if (!ledgerId || !addDate) return
    setAddBusy(true)
    setError('')
    try {
      const savedDate = (await window.api.invoke('key_event_upsert', {
        ledger_id: ledgerId,
        date: addDate,
        title: addTitle.trim(),
        content: '',
        color: '',
      })) as string
      const target = savedDate || addDate
      setAddOpen(false)
      setAddTitle('')
      setYear(target.slice(0, 4))
      setDate(target)
      if (target.slice(0, 4) === year) await loadDates()
    } catch (createError) {
      setError(errorMessage(createError))
    } finally {
      setAddBusy(false)
    }
  }, [addDate, addTitle, ledgerId, loadDates, year])

  const changeYear = useCallback(
    (start: string): void => {
      const next = start.slice(0, 4)
      if (!next || next === year) return
      clearSelection()
      setYear(next)
    },
    [clearSelection, year],
  )

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

  const onCardKeyDown = (keyboardEvent: KeyboardEvent<HTMLDivElement>, targetDate: string): void => {
    if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
      keyboardEvent.preventDefault()
      setDate(targetDate)
    }
  }

  return (
    <PageLayout
      contentClassName="key-event-page"
      toolbar={
        <TimeRangePicker
          testId="event-year"
          yearOnly
          mode="year"
          start={`${year}-01-01`}
          end={`${year}-12-31`}
          onModeChange={() => undefined}
          onRangeChange={changeYear}
        />
      }
    >
      {error ? (
        <p className="m0-error" data-testid="event-error">
          {error}
        </p>
      ) : null}

      <div className={`key-event-body${linksOpen ? '' : ' is-rail-collapsed'}`}>
        <aside className="key-event-panel key-event-panel--left">
          <div className="key-event-list">
            {events.length === 0 ? (
              <div className="key-event-empty">
                <span className="key-event-empty__text">暂无事件</span>
              </div>
            ) : (
              <ScrollArea className="key-event-cards">
                {events.map((item) => {
                  const active = item.date === date
                  return (
                    <div
                      key={item.id}
                      className={`key-event-card${active ? ' is-active' : ''}`}
                      role="button"
                      tabIndex={0}
                      aria-selected={active}
                      data-testid="event-date-item"
                      onClick={() => setDate(item.date)}
                      onKeyDown={(keyboardEvent) => onCardKeyDown(keyboardEvent, item.date)}
                    >
                      <div
                        className="key-event-card__bar"
                        style={{ backgroundColor: item.color || 'var(--transactions-color-primary)' }}
                      />
                      <div className="key-event-card__body">
                        <div className="key-event-card__name">{item.title || item.date}</div>
                        <div className="key-event-card__date">{shortDate(item.date)}</div>
                        {summaryOf(item.content) ? (
                          <div className="key-event-card__desc">{summaryOf(item.content)}</div>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="tr-icon-btn key-event-card__delete"
                        aria-label="删除事件"
                        title="删除事件"
                        onClick={(clickEvent) => {
                          clickEvent.stopPropagation()
                          void removeEvent(item.date)
                        }}
                      >
                        <Icon name="Close" size={13} />
                      </button>
                    </div>
                  )
                })}
              </ScrollArea>
            )}

            <div className="key-event-list__footer">
              <Button variant="primary" block testId="event-add" onClick={openAdd}>
                新增事件
              </Button>
            </div>
          </div>
        </aside>

        <section className="key-event-panel key-event-panel--center">
          <div
            className="key-event-detail"
            style={color ? ({ '--event-accent': color } as CSSProperties) : undefined}
          >
            {event ? (
              <div className="key-event-detail__body">
                <div className="key-event-detail__head">
                  <Input
                    className="key-event-title"
                    data-testid="event-title"
                    placeholder="事件标题"
                    value={title}
                    maxLength={200}
                    onChange={(changeEvent) => setTitle(changeEvent.target.value)}
                  />
                </div>

                <div className="key-event-colors">
                  {EVENT_COLORS.map(([value, name], index) => (
                    <button
                      key={value}
                      type="button"
                      className={`key-event-swatch${color === value ? ' is-selected' : ''}`}
                      style={{ backgroundColor: value }}
                      title={name}
                      aria-label={name}
                      data-testid={`event-color-${index}`}
                      onClick={() => setColor(value)}
                    />
                  ))}
                  <button
                    type="button"
                    className={`key-event-swatch key-event-swatch--empty${color ? '' : ' is-selected'}`}
                    title="使用默认颜色"
                    aria-label="使用默认颜色"
                    data-testid="event-color-none"
                    onClick={() => setColor('')}
                  />
                </div>

                <div className="key-event-images">
                  {images.map((image) => (
                    <figure key={image.id} className="key-event-image">
                      <img src={thumbUrl(image.thumbPath)} alt="事件图片" data-testid="event-image" />
                      <button
                        type="button"
                        className="tr-icon-btn key-event-image__delete"
                        aria-label="删除图片"
                        title="删除图片"
                        data-testid="event-image-delete"
                        onClick={() => void removeImage(image.id)}
                      >
                        <Icon name="Close" size={12} />
                      </button>
                    </figure>
                  ))}
                  <FileButton
                    testId="event-image-input"
                    accept="image/png,image/jpeg,image/webp,image/gif"
                    label="添加图片"
                    inputRef={fileRef}
                    onSelect={(file) => void addImage(file)}
                  />
                </div>

                <div className="key-event-description">
                  <Input.TextArea
                    className="key-event-content"
                    data-testid="event-content"
                    placeholder="写下这件事……"
                    value={content}
                    maxLength={5000}
                    autoSize={{ minRows: 6, maxRows: 14 }}
                    onChange={(changeEvent) => setContent(changeEvent.target.value)}
                  />
                </div>

                <div className="key-event-detail__footer">
                  <Button
                    variant="danger-outline"
                    testId="event-delete"
                    disabled={busy}
                    onClick={() => void removeEvent(date)}
                  >
                    删除
                  </Button>
                  <Button
                    variant="primary"
                    testId="event-save"
                    disabled={!ledgerId || busy}
                    onClick={() => void save()}
                  >
                    保存
                  </Button>
                </div>
              </div>
            ) : (
              <div className="key-event-empty key-event-empty--detail">
                <span className="key-event-empty__icon">
                  <Icon name="Star" size={28} />
                </span>
                <span className="key-event-empty__text">选择左侧事件查看详情</span>
              </div>
            )}
          </div>
        </section>

        <aside className="key-event-panel key-event-panel--right">
          <div className="key-event-linked">
            {!date ? (
              <div className="key-event-empty">
                <span className="key-event-empty__text">选择事件查看关联交易</span>
              </div>
            ) : linked.length === 0 ? (
              <div className="key-event-empty">
                <span className="key-event-empty__text">暂无关联交易</span>
              </div>
            ) : (
              <ScrollArea className="key-event-linked__cards">
                {linked.map((row) => (
                  <div key={row.transactionId} className="key-event-linked__card">
                    <div className="key-event-linked__body">
                      <div className="key-event-linked__row">
                        <span className="key-event-linked__value">
                          {row.description || row.category || '交易'}
                        </span>
                        <span
                          className={`key-event-linked__amount amount-${row.transactionType}`}
                        >
                          {signedAmount(row)}
                        </span>
                      </div>
                      <div className="key-event-linked__meta">
                        <div className="key-event-linked__tags">
                          {row.tags.map((tag) => (
                            <span key={tag} className="key-event-linked__tag">
                              {tag}
                            </span>
                          ))}
                        </div>
                        <span className="key-event-linked__desc">
                          {row.transactionAt
                            ? new Date(row.transactionAt * 1000).toLocaleDateString('zh-CN')
                            : ''}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </ScrollArea>
            )}
          </div>
        </aside>

        <button
          type="button"
          className="tr-icon-btn key-event-rail-toggle"
          data-testid="event-links-toggle"
          aria-label={linksOpen ? '收起关联交易' : '展开关联交易'}
          aria-expanded={linksOpen}
          title={linksOpen ? '收起关联交易' : '展开关联交易'}
          onClick={() => setLinksOpen((open) => !open)}
        >
          <Icon name={linksOpen ? 'ChevronRight' : 'ChevronLeft'} size={14} />
        </button>
      </div>

      <Modal
        open={addOpen}
        title="新增事件"
        width={420}
        centered
        destroyOnHidden
        footer={null}
        onCancel={() => setAddOpen(false)}
      >
        <div className="tr-modal-form">
          <div className="tr-modal-field">
            <span className="tr-modal-label">日期</span>
            <DatePicker testId="event-add-date" value={addDate} onChange={setAddDate} />
          </div>
          <div className="tr-modal-field">
            <span className="tr-modal-label">标题</span>
            <Input
              data-testid="event-add-title"
              placeholder="事件标题"
              value={addTitle}
              maxLength={200}
              onChange={(changeEvent) => setAddTitle(changeEvent.target.value)}
            />
          </div>
          <div className="tr-modal-footer">
            <Button variant="secondary" testId="event-add-cancel" onClick={() => setAddOpen(false)}>
              取消
            </Button>
            <Button
              variant="primary"
              testId="event-add-confirm"
              disabled={!addDate || addBusy}
              onClick={() => void createEvent()}
            >
              新增
            </Button>
          </div>
        </div>
      </Modal>

      {cropSrc ? (
        <ImageCrop
          src={cropSrc}
          onCancel={() => setCropSrc('')}
          onConfirm={(data) => void commitImage(data)}
        />
      ) : null}
    </PageLayout>
  )
}
