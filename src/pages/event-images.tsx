/**
 * 事件图片：选图、HEIC / 实况照片分组与上传前的预处理。
 *
 * 这里只碰 `File` 与画布，不碰 `window.api`：一次选中的文件怎么配成「静态图 + 同名的实况
 * 视频」在这里定，落库仍由页面负责。文件类型按字节判断，不信扩展名。
 */

import type { JSX, RefObject } from 'react'

import { isHeicSignature } from '../../shared/domain/image-signature'
import { FileButton } from '../components/file-button'
import { Icon } from '../components/icon'

export async function makeThumbnail(dataUrl: string): Promise<string> {
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

export function readDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

const STILL_EXTENSIONS = new Set(['heic', 'heif', 'jpg', 'jpeg', 'png', 'webp', 'gif'])
const MOTION_EXTENSIONS = new Set(['mov', 'mp4', 'm4v', 'webm'])

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot >= 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function stemOf(name: string): string {
  const dot = name.lastIndexOf('.')
  return (dot > 0 ? name.slice(0, dot) : name).toLowerCase()
}

/** 按字节判断，不信扩展名：改过后缀的 HEIC 也能走对分支（主进程同样按字节判断）。 */
export async function isHeicFile(file: File): Promise<boolean> {
  const head = await file.slice(0, 64).arrayBuffer()
  return isHeicSignature(new Uint8Array(head))
}

/** 一次选中的照片（可带实况视频）。 */
export interface PickedImage {
  still: File
  motion?: File
}

export interface PickedFiles {
  images: PickedImage[]
  orphanMotions: string[]
  unsupported: string[]
}

/**
 * iPhone 导出的实况是「同名照片 + 同名 MOV」两个文件：按文件名主干配对。
 * 只有视频没有照片时不做猜测，直接报给用户，避免把一段孤立视频存成"实况"。
 */
export function groupPickedFiles(files: File[]): PickedFiles {
  const groups = new Map<string, { still?: File; motion?: File }>()
  const order: string[] = []
  const unsupported: string[] = []

  for (const file of files) {
    const extension = extensionOf(file.name)
    const isStill = STILL_EXTENSIONS.has(extension) || file.type.startsWith('image/')
    const isMotion = MOTION_EXTENSIONS.has(extension) || file.type.startsWith('video/')
    if (!isStill && !isMotion) {
      unsupported.push(file.name)
      continue
    }
    const key = stemOf(file.name)
    let group = groups.get(key)
    if (!group) {
      group = {}
      groups.set(key, group)
      order.push(key)
    }
    if (isStill && !group.still) group.still = file
    else if (isMotion && !group.motion) group.motion = file
  }

  const images: PickedImage[] = []
  const orphanMotions: string[] = []
  for (const key of order) {
    const group = groups.get(key)
    if (!group) continue
    if (group.still) images.push({ still: group.still, motion: group.motion })
    else if (group.motion) orphanMotions.push(group.motion.name)
  }
  return { images, orphanMotions, unsupported }
}

/** 选中的文件里不能直接用的部分：孤立的实况视频、认不出的格式。 */
export function uploadProblems(picked: PickedFiles): string[] {
  const problems: string[] = []
  if (picked.orphanMotions.length > 0) {
    problems.push(`实况视频要和同名的照片一起选：${picked.orphanMotions.join('、')}`)
  }
  if (picked.unsupported.length > 0) {
    problems.push(`不支持的格式：${picked.unsupported.join('、')}`)
  }
  return problems
}

export interface ImageUploadPayload {
  data: string
  thumb?: string
  motion?: string
}

/**
 * 一张（或一组实况）照片的上传材料：原图不裁剪、不重编码，缩略图只为列表另存一份；
 * HEIC 不在这里生成缩略图（交给主进程转码时一并生成），实况视频一并读进来。
 */
export async function prepareImageUpload(picked: PickedImage): Promise<ImageUploadPayload> {
  const heic = await isHeicFile(picked.still)
  const data = await readDataUrl(picked.still)
  const motion = picked.motion ? await readDataUrl(picked.motion) : undefined
  if (heic) return { data, motion }
  return { data, thumb: await makeThumbnail(data), motion }
}

export const EVENT_IMAGE_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,image/heic,image/heif,video/quicktime,video/mp4,video/webm,.heic,.heif,.mov,.mp4,.m4v,.webm'

export interface EventImagePickerProps {
  /** 正在上传：按钮禁用并换文案 */
  busy: boolean
  /** 页面持着同一个 ref：上传结束要清空它，才能再选同一个文件 */
  inputRef: RefObject<HTMLInputElement | null>
  onSelect: (files: File[]) => void
}

/** 「添加图片」按钮：HEIC 交给主进程转码；实况照片要同时选中照片与同名的 .MOV。 */
export function EventImagePicker({ busy, inputRef, onSelect }: EventImagePickerProps): JSX.Element {
  return (
    <FileButton
      testId="event-image-input"
      accept={EVENT_IMAGE_ACCEPT}
      label={busy ? '正在添加…' : '添加图片'}
      title="支持 HEIC；实况照片请同时选中照片与同名的 .MOV"
      icon={<Icon name="Download" size={14} />}
      size="sm"
      multiple
      disabled={busy}
      inputRef={inputRef}
      onSelectMany={onSelect}
    />
  )
}
