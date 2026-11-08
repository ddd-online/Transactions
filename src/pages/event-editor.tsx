/**
 * 事件详情：颜色、图片区、描述与底部动作，以及「新增事件」弹窗。
 *
 * 只收页面递下来的值与回执：颜色改了、描述改了、保存/删除点了，都回传给页面落库。
 * 草稿文本由页面持有（切换事件时要跟着 key_event_get 一起重置），这里不自己存。
 */

import { type CSSProperties, type JSX, type RefObject } from 'react'
import { Input, Modal } from 'antd'

import type { KeyEvent, KeyEventImage } from '../../shared/domain/models'
import { Button } from '../components/button'
import { DatePicker } from '../components/date-picker'
import { Icon } from '../components/icon'
import { TimeRangePicker } from '../components/time-range-picker'
import { EVENT_TONES } from '../theme/event-colors'
import { EventImageGallery } from './event-gallery'
import { EventImagePicker } from './event-images'

export interface EventToolbarProps {
  year: string
  /** 选中的年份（`YYYY-01-01` / `YYYY-12-31` 里截前四位） */
  onYearChange: (start: string) => void
  onAdd: () => void
}

/** 页面工具栏：年份选择与「新增事件」入口。 */
export function EventToolbar({ year, onYearChange, onAdd }: EventToolbarProps): JSX.Element {
  return (
    <>
      <TimeRangePicker
        testId="event-year"
        yearOnly
        mode="year"
        start={`${year}-01-01`}
        end={`${year}-12-31`}
        onModeChange={() => undefined}
        onRangeChange={onYearChange}
      />
      <Button
        variant="primary"
        testId="event-add"
        icon={<Icon name="Plus" size={14} />}
        onClick={onAdd}
      >
        新增事件
      </Button>
    </>
  )
}

export interface EventEditorProps {
  /** `null` = 还没选事件，详情区显示空态 */
  event: KeyEvent | null
  color: string
  content: string
  draftContent: string
  editing: boolean
  busy: boolean
  /** 有账本才能保存（与原页面 `disabled={!ledgerId || busy}` 同义） */
  canSave: boolean
  images: KeyEventImage[]
  selectedImageId: string
  /** 页面持着同一个 ref：上传结束要清空它 */
  imageInputRef: RefObject<HTMLInputElement | null>
  onColorChange: (value: string) => void
  onDraftChange: (value: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: () => void
  onSelectImages: (files: File[]) => void
  onSelectImage: (id: string) => void
  onDeleteImage: (id: string) => void
  onSaveImage: (relativePath: string) => void
}

export function EventEditor({
  event,
  color,
  content,
  draftContent,
  editing,
  busy,
  canSave,
  images,
  selectedImageId,
  imageInputRef,
  onColorChange,
  onDraftChange,
  onStartEdit,
  onCancelEdit,
  onSave,
  onSelectImages,
  onSelectImage,
  onDeleteImage,
  onSaveImage,
}: EventEditorProps): JSX.Element {
  return (
    <section className="key-event-panel key-event-panel--center">
      <div className="key-event-detail">
        <h2 className="sr-only">事件详情</h2>
        {event ? (
          <div className="key-event-detail__body">
            <div className="key-event-colors">
              {EVENT_TONES.map(({ value, name }, index) => (
                <button
                  key={value}
                  type="button"
                  className={`key-event-swatch key-event-tone${color === value ? ' is-selected' : ''}`}
                  style={{ '--event-tone': value } as CSSProperties}
                  title={name}
                  aria-label={name}
                  aria-pressed={color === value}
                  data-testid={`event-color-${index}`}
                  onClick={() => void onColorChange(value)}
                />
              ))}
              <button
                type="button"
                className={`key-event-swatch key-event-swatch--empty${color ? '' : ' is-selected'}`}
                title="使用默认颜色"
                aria-label="使用默认颜色"
                aria-pressed={!color}
                data-testid="event-color-none"
                onClick={() => void onColorChange('')}
              />
            </div>

            <EventImageGallery
              images={images}
              selectedImageId={selectedImageId}
              onSelectImage={onSelectImage}
              onDeleteImage={onDeleteImage}
              onSaveImage={onSaveImage}
            />

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
                    onChange={(changeEvent) => onDraftChange(changeEvent.target.value)}
                  />
                </div>
              ) : (
                <div className="key-event-description__content" data-testid="event-content-view">
                  {content.trim() ? (
                    <p className="key-event-description__text">{content}</p>
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
                    onClick={onCancelEdit}
                  >
                    取消
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    testId="event-save"
                    disabled={!canSave || busy}
                    onClick={() => void onSave()}
                  >
                    保存
                  </Button>
                </>
              ) : (
                <>
                  <EventImagePicker
                    busy={busy}
                    inputRef={imageInputRef}
                    onSelect={onSelectImages}
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    testId="event-edit-content"
                    icon={<Icon name="Edit" size={14} />}
                    onClick={onStartEdit}
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
  )
}

export interface AddEventModalProps {
  open: boolean
  date: string
  title: string
  busy: boolean
  onDateChange: (date: string) => void
  onTitleChange: (title: string) => void
  onClose: () => void
  onConfirm: () => void
}

/** 新增事件弹窗：只画表单，开合与草稿由页面持有。 */
export function AddEventModal({
  open,
  date,
  title,
  busy,
  onDateChange,
  onTitleChange,
  onClose,
  onConfirm,
}: AddEventModalProps): JSX.Element {
  return (
    <Modal
      open={open}
      title="新增事件"
      width={420}
      centered
      destroyOnHidden
      footer={null}
      onCancel={onClose}
    >
      <div className="tr-modal-form">
        <div className="tr-modal-field">
          <span className="tr-modal-label">日期</span>
          <DatePicker testId="event-add-date" value={date} onChange={onDateChange} ariaLabel="日期" />
        </div>
        <div className="tr-modal-field">
          <span className="tr-modal-label">标题</span>
          <Input
            aria-label="标题"
            data-testid="event-add-title"
            placeholder="事件标题"
            value={title}
            maxLength={200}
            onChange={(changeEvent) => onTitleChange(changeEvent.target.value)}
          />
        </div>
        <div className="tr-modal-footer">
          <Button variant="secondary" testId="event-add-cancel" onClick={onClose}>
            取消
          </Button>
          <Button
            variant="primary"
            testId="event-add-confirm"
            disabled={!date || busy}
            onClick={onConfirm}
          >
            新增
          </Button>
        </div>
      </div>
    </Modal>
  )
}
