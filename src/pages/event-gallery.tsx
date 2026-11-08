/**
 * 事件页的只读视图：左侧日期列表、中间图片图库、右侧关联交易。
 *
 * 三个面板都只接收数据与回执，自己不开命令：选中哪一天、打开哪张图、删哪一条都回传给页面，
 * 由页面统一落库。图片预览的底衬与实况层的重挂是纯展示状态，留在图库里。
 */

import {
  useCallback,
  useMemo,
  useState,
  type CSSProperties,
  type JSX,
  type KeyboardEvent,
} from 'react'
import { Image as AntImage, Popconfirm } from 'antd'

import type { KeyEvent, KeyEventImage } from '../../shared/domain/models'
import type { TransactionRecordDto } from '../../shared/types/transaction'
import { centsToYuan } from '../../shared/domain/money'
import { Icon } from '../components/icon'
import { ScrollArea } from '../components/scroll-area'
import { LivePhoto } from './event-live-photo'

function assetUrl(relativePath: string): string {
  return `trasset://local/${relativePath
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`
}

function shortDate(date: string): string {
  return date.length >= 10 ? date.slice(5) : date
}

function summaryOf(content: string): string {
  return content.replace(/\s+/g, ' ').trim().slice(0, 30)
}

function signedAmount(row: TransactionRecordDto): string {
  const sign =
    row.transactionType === 'expense' ? '-' : row.transactionType === 'income' ? '+' : ''
  return `${sign}¥${centsToYuan(row.price)}`
}

export interface EventDateListProps {
  events: KeyEvent[]
  /** 当前选中的事件日期；空串 = 没选 */
  activeDate: string
  onSelectDate: (date: string) => void
  onDeleteEvent: (date: string) => void
}

/** 左侧事件日期列表：卡片、颜色条、删除入口，空态一句话。 */
export function EventDateList({
  events,
  activeDate,
  onSelectDate,
  onDeleteEvent,
}: EventDateListProps): JSX.Element {
  const onCardKeyDown = (
    keyboardEvent: KeyboardEvent<HTMLDivElement>,
    targetDate: string,
  ): void => {
    // 事件行里的删除按钮也有键盘焦点：Enter/Space 只应触发按钮本身
    if (keyboardEvent.target !== keyboardEvent.currentTarget) return
    if (keyboardEvent.key === 'Enter' || keyboardEvent.key === ' ') {
      keyboardEvent.preventDefault()
      onSelectDate(targetDate)
    }
  }

  return (
    <aside className="key-event-panel key-event-panel--left">
      <h2 className="sr-only">事件日期</h2>
      <div className="key-event-list">
        {events.length === 0 ? (
          <div className="key-event-empty">
            <span className="key-event-empty__text">暂无事件</span>
          </div>
        ) : (
          <ScrollArea className="key-event-cards">
            {events.map((item) => {
              const active = item.date === activeDate
              const summary = summaryOf(item.content)
              return (
                <div
                  key={item.id}
                  className={`key-event-card${active ? ' is-active' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-current={active ? 'true' : undefined}
                  data-testid="event-date-item"
                  onClick={() => onSelectDate(item.date)}
                  onKeyDown={(keyboardEvent) => onCardKeyDown(keyboardEvent, item.date)}
                >
                  <div
                    className="key-event-card__bar key-event-tone"
                    style={
                      {
                        '--event-tone': item.color || 'var(--transactions-color-primary)',
                      } as CSSProperties
                    }
                  />
                  <div className="key-event-card__body">
                    <div className="key-event-card__name">{item.title || item.date}</div>
                    <div className="key-event-card__date">
                      <span
                        className="key-event-card__dot key-event-tone"
                        style={
                          {
                            '--event-tone': item.color || 'var(--transactions-color-primary)',
                          } as CSSProperties
                        }
                        aria-hidden="true"
                      />
                      {shortDate(item.date)}
                    </div>
                    <div className="key-event-card__desc">{summary}</div>
                  </div>
                  <Popconfirm
                    title={`删除事件「${item.title || item.date}」？`}
                    description="事件里的图片会一并删除。"
                    okText="删除"
                    cancelText="取消"
                    okType="danger"
                    onConfirm={() => void onDeleteEvent(item.date)}
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
  )
}

export interface EventImageGalleryProps {
  images: KeyEventImage[]
  /** 用户选中的那张；空串或已失效时退回第一张 */
  selectedImageId: string
  onSelectImage: (id: string) => void
  onDeleteImage: (id: string) => void
  /** 保存当前主图：页面拿着相对路径去找主进程要文件框 */
  onSaveImage: (relativePath: string) => void
}

/** 中间图片区：主图、实况层、缩略图网格与空态，预览底衬也在这里管。 */
export function EventImageGallery({
  images,
  selectedImageId,
  onSelectImage,
  onDeleteImage,
  onSaveImage,
}: EventImageGalleryProps): JSX.Element {
  // 预览打开时锁定的底衬图：换图只换前景，虚化底不再跟着加载/闪烁。
  const [previewBackdrop, setPreviewBackdrop] = useState('')
  // 打开预览时让主图上的实况层重挂一次：视频随组件卸载停下，不在预览背后继续出声。
  const [stageEpoch, setStageEpoch] = useState(0)

  const mainImage = images.find((image) => image.id === selectedImageId) ?? images[0]
  const previewItems = images.map((image) => assetUrl(image.filePath))
  // 实况照片在预览里也要能播：按预览项的 URL 反查同一条记录。
  const motionByUrl = useMemo(
    () =>
      new Map(
        images
          .filter((image) => image.motionPath)
          .map((image) => [assetUrl(image.filePath), image.motionPath]),
      ),
    [images],
  )

  // 底衬固定为"打开预览时那张图"：翻页只换前景，避免新背景图加载期间虚化层闪空。
  const renderPreviewImage = useCallback(
    (node: JSX.Element, info: { image: { url: string } }): JSX.Element => {
      const motionPath = motionByUrl.get(info.image.url)
      return (
        <>
          <div
            className="key-event-preview-blur"
            aria-hidden="true"
            style={{ backgroundImage: `url("${previewBackdrop || info.image.url}")` }}
          />
          {node}
          {motionPath ? (
            <LivePhoto
              key={motionPath}
              motionUrl={assetUrl(motionPath)}
              variant="preview"
              testId="event-live-preview"
            />
          ) : null}
        </>
      )
    },
    [motionByUrl, previewBackdrop],
  )

  return (
    <div className="key-event-gallery">
      <div className="key-event-gallery__view">
        {!mainImage ? (
          <div className="key-event-gallery__empty" data-testid="event-gallery-empty">
            暂无图片
          </div>
        ) : (
          <>
            <div className="key-event-gallery__main">
              {/* 照片按 contain 完整显示，两侧留白由同一张图放大虚化垫底 */}
              <div
                className="key-event-gallery__blur"
                aria-hidden="true"
                style={{ backgroundImage: `url("${assetUrl(mainImage.thumbPath)}")` }}
              />
              <AntImage.PreviewGroup
                items={previewItems}
                preview={{
                  imageRender: renderPreviewImage,
                  // 只在打开时锁定底衬；关闭时不改，淡出过程里背景也不会跳。
                  onOpenChange: (open, info) => {
                    if (!open) return
                    setPreviewBackdrop(previewItems[info.current] ?? '')
                    setStageEpoch((value) => value + 1)
                  },
                }}
              >
                <AntImage
                  className="key-event-gallery__img"
                  src={assetUrl(mainImage.filePath)}
                  alt="事件图片"
                  data-testid="event-image-main"
                />
              </AntImage.PreviewGroup>
              {mainImage.motionPath ? (
                <LivePhoto
                  key={`${mainImage.id}-${stageEpoch}`}
                  motionUrl={assetUrl(mainImage.motionPath)}
                  variant="stage"
                  testId="event-live"
                />
              ) : null}
              <button
                type="button"
                className="tr-icon-btn key-event-gallery__download"
                aria-label="保存图片"
                title="保存图片"
                data-testid="event-image-save"
                onClick={() => void onSaveImage(mainImage.filePath)}
              >
                <Icon name="Download" size={14} />
              </button>
            </div>

            <ScrollArea className="key-event-gallery__thumbs">
              {images.map((image, index) => {
                const selected = image.id === mainImage.id
                return (
                  <div
                    key={image.id}
                    className={`key-event-thumb${selected ? ' is-selected' : ''}`}
                  >
                    {/* 缩略图是「看这张」的大按钮：选中态交给 aria-pressed，
                        键盘能 Tab 到、Enter / Space 能切。删除键是它的**兄弟**、叠在上面 ——
                        按钮套按钮是无效 HTML，Tab 顺序也会乱。 */}
                    <button
                      type="button"
                      className="key-event-thumb__select"
                      aria-pressed={selected}
                      aria-label={`查看第 ${index + 1} 张图片，共 ${images.length} 张${image.motionPath ? '，实况照片' : ''}`}
                      data-testid="event-image-select"
                      onClick={() => onSelectImage(image.id)}
                    >
                      <img
                        className="key-event-thumb__img"
                        src={assetUrl(image.thumbPath)}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        data-testid="event-image"
                      />
                    </button>
                    {image.motionPath ? (
                      <span
                        className="key-event-thumb__live"
                        data-testid="event-image-live"
                        aria-hidden="true"
                      >
                        <Icon name="CaretRight" size={9} />
                        实况
                      </span>
                    ) : null}
                    <Popconfirm
                      title="删除这张图片？"
                      okText="删除"
                      cancelText="取消"
                      okType="danger"
                      onConfirm={() => void onDeleteImage(image.id)}
                    >
                      <button
                        type="button"
                        className="tr-icon-btn key-event-thumb__delete"
                        aria-label={`删除第 ${index + 1} 张图片`}
                        title="删除图片"
                        data-testid="event-image-delete"
                      >
                        <Icon name="Close" size={12} />
                      </button>
                    </Popconfirm>
                  </div>
                )
              })}
            </ScrollArea>
          </>
        )}
      </div>
    </div>
  )
}

export interface EventLinkedPanelProps {
  /** 当前事件日期；空串 = 没选事件 */
  date: string
  linked: TransactionRecordDto[]
  linksOpen: boolean
  onToggleLinks: () => void
}

/** 右侧关联交易栏：日期未选 / 没有关联 / 明细列表三种状态，末尾是收起展开按钮。 */
export function EventLinkedPanel({
  date,
  linked,
  linksOpen,
  onToggleLinks,
}: EventLinkedPanelProps): JSX.Element {
  return (
    <>
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
                      <span className={`key-event-linked__amount amount-${row.transactionType}`}>
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
        onClick={() => void onToggleLinks()}
      >
        <Icon name={linksOpen ? 'ChevronRight' : 'ChevronLeft'} size={14} />
      </button>
    </>
  )
}
