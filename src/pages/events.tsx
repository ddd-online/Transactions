import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
} from 'react'
import { Image as AntImage, Input, Modal, Popconfirm } from 'antd'

import type { KeyEvent, KeyEventImage } from '../../shared/domain/models'
import type { TransactionRecordDto } from '../../shared/types/transaction'
import { centsToYuan } from '../../shared/domain/money'
import { todayYmd } from '../../shared/domain/time'
import { Button } from '../components/button'
import { DatePicker } from '../components/date-picker'
import { FileButton } from '../components/file-button'
import { Icon } from '../components/icon'
import { Markdown } from '../components/markdown'
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

function assetUrl(relativePath: string): string {
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

/** 大图预览的底衬：把当前这张图放大铺满、虚化，照片比例和屏幕不一致时两侧不再是死黑。 */
function previewImageRender(node: JSX.Element, info: { image: { url: string } }): JSX.Element {
  return (
    <>
      <div
        className="key-event-preview-blur"
        aria-hidden="true"
        style={{ backgroundImage: `url("${info.image.url}")` }}
      />
      {node}
    </>
  )
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
  const [editing, setEditing] = useState(false)
  const [draftContent, setDraftContent] = useState('')
  const [selectedImageId, setSelectedImageId] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
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
    setEditing(false)
    setDraftContent('')
    setSelectedImageId('')
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
      setEditing(false)
      setDraftContent('')
      setSelectedImageId('')
      return
    }
    try {
      const row = await window.api.invoke('key_event_get', { ledger_id: ledgerId, date })
      setEvent(row)
      setTitle(row.title)
      setContent(row.content)
      setColor(row.color)
      setDraftContent(row.content)
      setEditing(false)
    } catch {
      setEvent(null)
      setTitle('')
      setContent('')
      setColor('')
      setDraftContent('')
      setEditing(false)
    }
    try {
      const rows = await window.api.invoke('key_event_images_list', {
        ledger_id: ledgerId,
        date,
      })
      setImages(rows)
      setSelectedImageId((current) =>
        rows.some((row) => row.id === current) ? current : (rows[0]?.id ?? ''),
      )
    } catch (loadError) {
      setError(errorMessage(loadError))
    }
  }, [date, ledgerId])

  useEffect(() => {
    let alive = true
    void (async () => {
      try {
        const config = await window.api.invoke('config_get')
        if (alive) setLinksOpen(config.keyEventLinkedOpen)
      } catch {
        // 配置读不到时保持默认展开
      }
    })()
    return () => {
      alive = false
    }
  }, [])

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

  const saveContent = useCallback(async (): Promise<void> => {
    if (!ledgerId || !date) return
    setBusy(true)
    setError('')
    const nextContent = draftContent
    // 标题为空时退化成正文首行：与列表卡片、桌面端保持同一条规则
    const nextTitle =
      title.trim() ||
      (nextContent
        .split('\n')
        .map((line) => line.trim())
        .find((line) => line.length > 0) ?? '').slice(0, 200)
    try {
      await window.api.invoke('key_event_upsert', {
        ledger_id: ledgerId,
        date,
        title: nextTitle,
        content: nextContent,
        color,
      })
      await Promise.all([loadEvent(), loadDates()])
    } catch (saveError) {
      setError(errorMessage(saveError))
    } finally {
      setBusy(false)
    }
  }, [color, date, draftContent, ledgerId, loadDates, loadEvent, title])

  // 颜色是即时生效的开关：点一下立刻落库，不跟描述编辑的保存绑在一起
  const changeColor = useCallback(
    async (value: string): Promise<void> => {
      if (!ledgerId || !date) return
      const previous = color
      setColor(value)
      setError('')
      try {
        await window.api.invoke('key_event_upsert', {
          ledger_id: ledgerId,
          date,
          title,
          content,
          color: value,
        })
        setEvent((current) => (current ? { ...current, color: value } : current))
        await loadDates()
      } catch (saveError) {
        setColor(previous)
        setError(errorMessage(saveError))
      }
    },
    [color, content, date, ledgerId, loadDates, title],
  )

  const startEdit = useCallback((): void => {
    setDraftContent(content)
    setEditing(true)
  }, [content])

  const cancelEdit = useCallback((): void => {
    setDraftContent(content)
    setEditing(false)
  }, [content])

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
        await Promise.all([loadEvent(), loadDates()])
      } catch (imageError) {
        setError(errorMessage(imageError))
      } finally {
        setBusy(false)
      }
    },
    [color, content, date, event, ledgerId, loadDates, loadEvent, title],
  )

  // 事件图片按原图上传：不裁剪、不重编码，缩略图只为列表另存一份。
  const addImage = useCallback(
    async (file: File | undefined): Promise<void> => {
      if (!file || !ledgerId) return
      setError('')
      try {
        await commitImage(await readDataUrl(file))
      } catch (readError) {
        setError(errorMessage(readError))
      } finally {
        if (fileRef.current) fileRef.current.value = ''
      }
    },
    [commitImage, ledgerId],
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

  const saveImage = useCallback(async (): Promise<void> => {
    const current = images.find((image) => image.id === selectedImageId) ?? images[0]
    if (!current) return
    setError('')
    try {
      const result = await window.api.invoke('file_save_image', {
        relativePath: current.filePath,
      })
      if (result.canceled) return
      if (!result.success) setError(result.error ?? '保存图片失败')
    } catch (saveError) {
      setError(errorMessage(saveError))
    }
  }, [images, selectedImageId])

  const toggleLinks = useCallback(async (): Promise<void> => {
    const next = !linksOpen
    setLinksOpen(next)
    setError('')
    try {
      const persisted = await window.api.invoke('config_set_key_event_linked_open', { open: next })
      setLinksOpen(persisted)
    } catch (toggleError) {
      setLinksOpen(!next)
      setError(errorMessage(toggleError))
    }
  }, [linksOpen])

  const onCardKeyDown = (keyboardEvent: KeyboardEvent<HTMLDivElement>, targetDate: string): void => {
    // 事件行里的删除按钮也有键盘焦点：Enter/Space 只应触发按钮本身
    if (keyboardEvent.target !== keyboardEvent.currentTarget) return
    if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
      keyboardEvent.preventDefault()
      setDate(targetDate)
    }
  }

  const mainImage = images.find((image) => image.id === selectedImageId) ?? images[0]
  const previewItems = images.map((image) => assetUrl(image.filePath))

  return (
    <PageLayout
      contentClassName="key-event-page"
      toolbar={
        <>
          <TimeRangePicker
            testId="event-year"
            yearOnly
            mode="year"
            start={`${year}-01-01`}
            end={`${year}-12-31`}
            onModeChange={() => undefined}
            onRangeChange={changeYear}
          />
          <Button
            variant="primary"
            testId="event-add"
            icon={<Icon name="Plus" size={14} />}
            onClick={openAdd}
          >
            新增事件
          </Button>
        </>
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
                  const summary = summaryOf(item.content)
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
                        <div className="key-event-card__desc">{summary}</div>
                      </div>
                      <Popconfirm
                        title={`删除事件「${item.title || item.date}」？`}
                        description="事件里的图片会一并删除。"
                        okText="删除"
                        cancelText="取消"
                        okType="danger"
                        onConfirm={() => void removeEvent(item.date)}
                      >
                        <button
                          type="button"
                          className="tr-icon-btn key-event-card__delete"
                          aria-label="删除事件"
                          title="删除事件"
                          data-testid="event-delete"
                          onClick={(clickEvent) => clickEvent.stopPropagation()}
                        >
                          <Icon name="Close" size={13} />
                        </button>
                      </Popconfirm>
                    </div>
                  )
                })}
              </ScrollArea>
            )}
          </div>
        </aside>

        <section className="key-event-panel key-event-panel--center">
          <div className="key-event-detail">
            {event ? (
              <div className="key-event-detail__body">
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
                      onClick={() => void changeColor(value)}
                    />
                  ))}
                  <button
                    type="button"
                    className={`key-event-swatch key-event-swatch--empty${color ? '' : ' is-selected'}`}
                    title="使用默认颜色"
                    aria-label="使用默认颜色"
                    data-testid="event-color-none"
                    onClick={() => void changeColor('')}
                  />
                </div>

                <div className="key-event-gallery">
                  <div className="key-event-gallery__view">
                    {!mainImage ? (
                      <div className="key-event-gallery__empty" data-testid="event-gallery-empty">
                        暂无图片
                      </div>
                    ) : (
                      <>
                        <div className="key-event-gallery__main">
                          <AntImage.PreviewGroup
                            items={previewItems}
                            preview={{ imageRender: previewImageRender }}
                          >
                            <AntImage
                              className="key-event-gallery__img"
                              src={assetUrl(mainImage.filePath)}
                              alt="事件图片"
                              data-testid="event-image-main"
                            />
                          </AntImage.PreviewGroup>
                          <button
                            type="button"
                            className="tr-icon-btn key-event-gallery__download"
                            aria-label="保存图片"
                            title="保存图片"
                            data-testid="event-image-save"
                            onClick={() => void saveImage()}
                          >
                            <Icon name="Download" size={14} />
                          </button>
                        </div>

                        <ScrollArea className="key-event-gallery__thumbs">
                          {images.map((image) => (
                            <div
                              key={image.id}
                              className={`key-event-thumb${image.id === mainImage.id ? ' is-selected' : ''}`}
                            >
                              <img
                                className="key-event-thumb__img"
                                src={assetUrl(image.thumbPath)}
                                alt="事件图片"
                                data-testid="event-image"
                                onClick={() => setSelectedImageId(image.id)}
                              />
                              <Popconfirm
                                title="删除这张图片？"
                                okText="删除"
                                cancelText="取消"
                                okType="danger"
                                onConfirm={() => void removeImage(image.id)}
                              >
                                <button
                                  type="button"
                                  className="tr-icon-btn key-event-thumb__delete"
                                  aria-label="删除图片"
                                  title="删除图片"
                                  data-testid="event-image-delete"
                                  onClick={(clickEvent) => clickEvent.stopPropagation()}
                                >
                                  <Icon name="Close" size={12} />
                                </button>
                              </Popconfirm>
                            </div>
                          ))}
                        </ScrollArea>
                      </>
                    )}
                  </div>
                </div>

                <div className="key-event-description">
                  {editing ? (
                    <div className="key-event-description__edit">
                      <Input.TextArea
                        className="key-event-content"
                        data-testid="event-content"
                        placeholder="写下这件事……"
                        value={draftContent}
                        maxLength={5000}
                        autoSize={{ minRows: 6, maxRows: 14 }}
                        onChange={(changeEvent) => setDraftContent(changeEvent.target.value)}
                      />
                    </div>
                  ) : (
                    <div className="key-event-description__content" data-testid="event-content-view">
                      {content.trim() ? (
                        <Markdown source={content} />
                      ) : (
                        <p className="key-event-description__placeholder">暂无描述</p>
                      )}
                    </div>
                  )}
                </div>

                <div className="key-event-detail__footer">
                  {editing ? (
                    <>
                      <Button
                        variant="secondary"
                        size="sm"
                        testId="event-edit-cancel"
                        disabled={busy}
                        onClick={cancelEdit}
                      >
                        取消
                      </Button>
                      <Button
                        variant="primary"
                        size="sm"
                        testId="event-save"
                        disabled={!ledgerId || busy}
                        onClick={() => void saveContent()}
                      >
                        保存
                      </Button>
                    </>
                  ) : (
                    <>
                      <FileButton
                        testId="event-image-input"
                        accept="image/png,image/jpeg,image/webp,image/gif"
                        label="添加图片"
                        icon={<Icon name="Download" size={14} />}
                        size="sm"
                        inputRef={fileRef}
                        onSelect={(file) => void addImage(file)}
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        testId="event-edit-content"
                        icon={<Icon name="Edit" size={14} />}
                        onClick={startEdit}
                      >
                        编辑描述
                      </Button>
                    </>
                  )}
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
          onClick={() => void toggleLinks()}
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
    </PageLayout>
  )
}
