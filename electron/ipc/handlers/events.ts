/**
 * 关键事件命令：按年查询、单日读写、图片增删。
 *
 * HEIC 转码在 `prepareEventImage` 里；本文件只做参数校验与工作空间句柄的传递。
 */
import { AppError, workspaceNotOpened } from '../../../shared/errors'
import { currentWorkspace } from '../../db'
import * as keyEventService from '../../services/key-event'
import { encodeJpeg } from '../../services/image-codec'
import { prepareEventImage } from '../../services/image-import'
import type { HandlerMap } from '../commands'
import { asObject, workspaceDb, type HandlerContext } from './context'

export function createEventHandlers(
  _ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'key_event_list_by_year'
  | 'key_event_dates_by_year'
  | 'key_event_get'
  | 'key_event_upsert'
  | 'key_event_delete'
  | 'key_event_images_list'
  | 'key_event_image_add'
  | 'key_event_image_delete'
> {
  return {
    key_event_list_by_year(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const year = String(raw.year ?? '')
      if (!year) throw new AppError('missing year parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return keyEventService.queryKeyEventsByYear(workspaceDb(), ledgerId, year)
    },

    key_event_dates_by_year(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const year = String(raw.year ?? '')
      if (!year) throw new AppError('missing year parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return keyEventService.queryDatesByYear(workspaceDb(), ledgerId, year)
    },

    key_event_get(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return keyEventService.queryKeyEventByDate(workspaceDb(), ledgerId, date)
    },

    key_event_upsert(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      const date = String(raw.date ?? '')
      keyEventService.upsertKeyEvent(
        workspaceDb(),
        ledgerId,
        date,
        typeof raw.title === 'string' ? raw.title : '',
        typeof raw.content === 'string' ? raw.content : '',
        typeof raw.color === 'string' ? raw.color : '',
      )
      return date
    },

    key_event_delete(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      const workspace = currentWorkspace()
      if (!workspace) throw workspaceNotOpened()
      keyEventService.deleteKeyEventByDate(workspace.db, workspace.directory, ledgerId, date)
      return null
    },

    key_event_images_list(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return keyEventService.listImages(workspaceDb(), ledgerId, date)
    },

    async key_event_image_add(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      const data = typeof raw.data === 'string' ? raw.data : ''
      const thumb = typeof raw.thumb === 'string' ? raw.thumb : ''
      const motion = typeof raw.motion === 'string' ? raw.motion : ''
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!data) throw new AppError('invalid image data', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      const workspace = currentWorkspace()
      if (!workspace) throw workspaceNotOpened()
      // HEIC 在这里转码（Chromium 解码不了），实况视频同一笔记在同一行记录上。
      const files = await prepareEventImage(
        {
          dataUri: data,
          thumbDataUri: thumb || undefined,
          motionDataUri: motion || undefined,
        },
        { encodeJpeg },
      )
      return keyEventService.addImage(workspace.db, workspace.directory, ledgerId, date, files)
    },

    key_event_image_delete(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('missing image id parameter', { status: 400 })
      const workspace = currentWorkspace()
      if (!workspace) throw workspaceNotOpened()
      keyEventService.deleteImage(workspace.db, workspace.directory, id)
      return null
    },
  }
}
