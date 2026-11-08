import { useCallback, useEffect, useRef, useState, type JSX } from 'react'

import type { KeyEvent, KeyEventImage } from '../../shared/domain/models'
import type { TransactionRecordDto } from '../../shared/types/transaction'
import { todayYmd } from '../../shared/domain/time'
import { PageLayout } from '../components/page-layout'
import { AddEventModal, EventEditor, EventToolbar } from './event-editor'
import { EventDateList, EventLinkedPanel } from './event-gallery'
import { groupPickedFiles, prepareImageUpload, uploadProblems } from './event-images'

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'msg' in error) {
    return String((error as { msg: unknown }).msg)
  }
  if (error instanceof Error) return error.message
  return String(error)
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

  const uploadImage = useCallback(
    async (payload: { data: string; thumb?: string; motion?: string }): Promise<void> => {
      await window.api.invoke('key_event_image_add', {
        ledger_id: ledgerId,
        date,
        data: payload.data,
        thumb: payload.thumb ?? null,
        motion: payload.motion ?? null,
      })
    },
    [date, ledgerId],
  )

  const addImages = useCallback(
    async (files: File[]): Promise<void> => {
      if (!ledgerId || files.length === 0) return
      const picked = groupPickedFiles(files)
      const problems = uploadProblems(picked)

      setError('')
      if (picked.images.length === 0) {
        setError(problems.join('；'))
        if (fileRef.current) fileRef.current.value = ''
        return
      }

      setBusy(true)
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
        for (const pickedImage of picked.images) {
          try {
            await uploadImage(await prepareImageUpload(pickedImage))
          } catch (imageError) {
            problems.push(`${pickedImage.still.name}：${errorMessage(imageError)}`)
          }
          // 每加一张就刷一次：多选时用户能立刻看到进度，失败的那张也不影响后面的。
          await loadEvent()
        }
        await loadDates()
        if (problems.length > 0) setError(problems.join('；'))
      } catch (addError) {
        setError(errorMessage(addError))
      } finally {
        setBusy(false)
        if (fileRef.current) fileRef.current.value = ''
      }
    },
    [color, content, date, event, ledgerId, loadDates, loadEvent, title, uploadImage],
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

  const saveImage = useCallback(async (relativePath: string): Promise<void> => {
    if (!relativePath) return
    setError('')
    try {
      const result = await window.api.invoke('file_save_image', {
        relativePath,
      })
      if (result.canceled) return
      if (!result.success) setError(result.error ?? '保存图片失败')
    } catch (saveError) {
      setError(errorMessage(saveError))
    }
  }, [])

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

  return (
    <PageLayout
      contentClassName="key-event-page"
      toolbar={<EventToolbar year={year} onYearChange={changeYear} onAdd={openAdd} />}
    >
      {error ? (
        <p role="alert" className="m0-error" data-testid="event-error">
          {error}
        </p>
      ) : null}

      <div className={`key-event-body${linksOpen ? '' : ' is-rail-collapsed'}`}>
        <EventDateList
          events={events}
          activeDate={date}
          onSelectDate={setDate}
          onDeleteEvent={removeEvent}
        />

        <EventEditor
          event={event}
          color={color}
          content={content}
          draftContent={draftContent}
          editing={editing}
          busy={busy}
          canSave={Boolean(ledgerId)}
          images={images}
          selectedImageId={selectedImageId}
          imageInputRef={fileRef}
          onColorChange={changeColor}
          onDraftChange={setDraftContent}
          onStartEdit={startEdit}
          onCancelEdit={cancelEdit}
          onSave={saveContent}
          onSelectImages={(files) => void addImages(files)}
          onSelectImage={setSelectedImageId}
          onDeleteImage={removeImage}
          onSaveImage={saveImage}
        />

        <EventLinkedPanel
          date={date}
          linked={linked}
          linksOpen={linksOpen}
          onToggleLinks={toggleLinks}
        />
      </div>

      <AddEventModal
        open={addOpen}
        date={addDate}
        title={addTitle}
        busy={addBusy}
        onDateChange={setAddDate}
        onTitleChange={setAddTitle}
        onClose={() => setAddOpen(false)}
        onConfirm={() => void createEvent()}
      />
    </PageLayout>
  )
}
