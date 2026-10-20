import { randomUUID } from 'node:crypto'

import { AppError } from '../../shared/errors'
import type { KeyEvent, KeyEventImage } from '../../shared/domain/models'
import type { Db } from '../db/driver'
import {
  deleteByDate as deleteEventByDate,
  ensureExists,
  queryByDate,
  queryByYear,
  TITLE_MAX_CHARS,
  upsert,
} from '../db/dao/key-event'
import {
  create as createImageRow,
  deleteByEventDate,
  deleteById as deleteImageRow,
  queryByEventDate,
  queryById as queryImageById,
} from '../db/dao/key-event-image'
import { logInfo, logWarn } from '../logging'
import { removeImageFiles, saveImage } from './assets'

/** 写入关键事件（标题按 Unicode 字符截断到 200）。 */
export function upsertKeyEvent(
  db: Db,
  ledgerId: string,
  date: string,
  title: string,
  content: string,
  color: string,
): void {
  const event: KeyEvent = {
    id: randomUUID(),
    date,
    title: Array.from(title).slice(0, TITLE_MAX_CHARS).join(''),
    content,
    color,
    createdAt: 0,
    updatedAt: 0,
    ledgerId,
  }
  upsert(db, event)
}

/** 按日期取关键事件；不存在时报 404。 */
export function queryKeyEventByDate(db: Db, ledgerId: string, date: string): KeyEvent {
  const event = queryByDate(db, ledgerId, date)
  if (!event) throw new AppError('record not found', { status: 404 })
  return event
}

export function queryKeyEventsByYear(db: Db, ledgerId: string, year: string): KeyEvent[] {
  return queryByYear(db, ledgerId, year)
}

export function queryDatesByYear(db: Db, ledgerId: string, year: string): string[] {
  return queryByYear(db, ledgerId, year).map((event) => event.date)
}

/** 删除某天的事件：事务内删图片记录与事件，提交后清理磁盘文件。 */
export function deleteKeyEventByDate(
  db: Db,
  workspaceDir: string,
  ledgerId: string,
  date: string,
): void {
  logInfo(`删除关键事件, 日期: ${date}`)
  const images = queryByEventDate(db, ledgerId, date)
  db.transaction(() => {
    deleteByEventDate(db, ledgerId, date)
    deleteEventByDate(db, ledgerId, date)
  })
  for (const image of images) {
    removeImageFiles(workspaceDir, image.filePath, image.thumbPath)
  }
}

/** 新增一张图片：先落盘，写记录失败时回滚文件。 */
export function addImage(
  db: Db,
  workspaceDir: string,
  ledgerId: string,
  date: string,
  dataUri: string,
  thumbDataUri: string,
): KeyEventImage {
  const imageId = randomUUID()
  const saved = saveImage(workspaceDir, date, imageId, dataUri, thumbDataUri)

  let existing: KeyEventImage[]
  try {
    existing = queryByEventDate(db, ledgerId, date)
  } catch (error) {
    removeImageFiles(workspaceDir, saved.filePath, saved.thumbPath)
    throw error
  }

  const maxSort = existing.reduce((max, image) => Math.max(max, image.sortOrder), 0)
  const image: KeyEventImage = {
    id: imageId,
    ledgerId,
    eventDate: date,
    filePath: saved.filePath,
    thumbPath: saved.thumbPath,
    sortOrder: maxSort + 1,
    createdAt: 0,
  }
  try {
    createImageRow(db, image)
  } catch (error) {
    removeImageFiles(workspaceDir, image.filePath, image.thumbPath)
    throw error
  }
  return image
}

export function listImages(db: Db, ledgerId: string, date: string): KeyEventImage[] {
  return queryByEventDate(db, ledgerId, date)
}

/** 删除一张图片（记录 + 磁盘文件；记录不存在时保持幂等）。 */
export function deleteImage(db: Db, workspaceDir: string, imageId: string): void {
  const image = queryImageById(db, imageId)
  if (image) {
    removeImageFiles(workspaceDir, image.filePath, image.thumbPath)
  } else {
    logWarn(`删除图片时未找到记录: ${imageId}`)
  }
  deleteImageRow(db, imageId)
}

/** 关联交易时用来确保目标日期有关键事件。 */
export function ensureKeyEventExists(db: Db, ledgerId: string, date: string): boolean {
  return ensureExists(db, ledgerId, date)
}
