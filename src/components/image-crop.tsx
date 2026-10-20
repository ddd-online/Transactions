import { useCallback, useRef, useState, type JSX, type PointerEvent } from 'react'

export interface ImageCropProps {
  src: string
  onCancel: () => void
  onConfirm: (dataUrl: string) => void
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

const MIN_SIZE = 0.02

/** 事件图片裁剪：拖动选择区域，确认后由 canvas 输出 JPEG。 */
export function ImageCrop({ src, onCancel, onConfirm }: ImageCropProps): JSX.Element {
  const stageRef = useRef<HTMLDivElement>(null)
  const [rect, setRect] = useState<Rect>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 })
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null)

  const pointOf = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current
    if (!stage) return { x: 0, y: 0 }
    const bounds = stage.getBoundingClientRect()
    return {
      x: Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width)),
      y: Math.min(1, Math.max(0, (event.clientY - bounds.top) / bounds.height)),
    }
  }, [])

  const confirm = useCallback((): void => {
    const image = stageRef.current?.querySelector('img')
    if (!image) return
    const naturalWidth = image.naturalWidth
    const naturalHeight = image.naturalHeight
    const width = Math.max(1, Math.round(rect.w * naturalWidth))
    const height = Math.max(1, Math.round(rect.h * naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(
      image,
      Math.round(rect.x * naturalWidth),
      Math.round(rect.y * naturalHeight),
      width,
      height,
      0,
      0,
      width,
      height,
    )
    onConfirm(canvas.toDataURL('image/jpeg', 0.9))
  }, [onConfirm, rect])

  return (
    <div className="ui-modal__mask" role="presentation">
      <div className="ui-modal__content ui-modal__content--lg" role="dialog" aria-modal="true">
        <header className="ui-modal__header">
          <h2 className="ui-modal__title">裁剪图片</h2>
        </header>
        <div className="ui-modal__body">
          <div
            ref={stageRef}
            className="image-crop-stage"
            data-testid="image-crop"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              const point = pointOf(event)
              setDragStart(point)
              setRect({ x: point.x, y: point.y, w: MIN_SIZE, h: MIN_SIZE })
            }}
            onPointerMove={(event) => {
              if (!dragStart) return
              const point = pointOf(event)
              setRect({
                x: Math.min(dragStart.x, point.x),
                y: Math.min(dragStart.y, point.y),
                w: Math.max(MIN_SIZE, Math.abs(point.x - dragStart.x)),
                h: Math.max(MIN_SIZE, Math.abs(point.y - dragStart.y)),
              })
            }}
            onPointerUp={() => setDragStart(null)}
            onPointerCancel={() => setDragStart(null)}
          >
            <img src={src} alt="待裁剪" draggable={false} />
            <div
              className="image-crop-box"
              style={{
                left: `${rect.x * 100}%`,
                top: `${rect.y * 100}%`,
                width: `${rect.w * 100}%`,
                height: `${rect.h * 100}%`,
              }}
            />
          </div>
          <p className="m0-muted">拖动鼠标选择保留区域，默认保留中间 80%。</p>
        </div>
        <footer className="ui-modal__footer">
          <button type="button" className="ui-btn ui-btn--secondary" onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className="ui-btn ui-btn--primary"
            data-testid="image-crop-confirm"
            onClick={confirm}
          >
            使用这张
          </button>
        </footer>
      </div>
    </div>
  )
}
