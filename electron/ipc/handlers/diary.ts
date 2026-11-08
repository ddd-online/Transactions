/**
 * 日记命令：按日期读写、目录扫描导入、按年 / 月导出。
 *
 * 分段与路径处理都在 services/diary；这里只做参数校验。
 */
import { AppError } from '../../../shared/errors'
import * as diaryService from '../../services/diary'
import type { HandlerMap } from '../commands'
import { asObject, workspaceDb, type HandlerContext } from './context'

export function createDiaryHandlers(
  _ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'diary_list_dates'
  | 'diary_get'
  | 'diary_upsert'
  | 'diary_delete'
  | 'diary_import_scan'
  | 'diary_import_file'
  | 'diary_export'
> {
  return {
    diary_list_dates(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return diaryService.listDates(workspaceDb(), ledgerId)
    },

    diary_get(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return diaryService.getByDate(workspaceDb(), ledgerId, date)
    },

    diary_upsert(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return diaryService.upsert(
        workspaceDb(),
        ledgerId,
        date,
        typeof raw.content === 'string' ? raw.content : '',
        typeof raw.mood === 'string' ? raw.mood : '',
      )
    },

    diary_delete(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      diaryService.deleteByDate(workspaceDb(), ledgerId, date)
      return null
    },

    diary_import_scan(request) {
      const directory = String(asObject(request).directory ?? '')
      if (!directory) throw new AppError('directory is required', { status: 400 })
      return diaryService.scanDirectory(directory)
    },

    diary_import_file(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const path = String(raw.path ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('missing date parameter', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return diaryService.importFile(workspaceDb(), ledgerId, path, date)
    },

    diary_export(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const directory = String(raw.directory ?? '')
      if (!directory) throw new AppError('directory is required', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      const year = typeof raw.year === 'number' ? raw.year : 0
      const month = typeof raw.month === 'number' ? raw.month : 0
      if (!(year >= 0 && month >= 0 && month <= 12 && !(year === 0 && month !== 0))) {
        throw new AppError('invalid year/month range', { status: 400 })
      }
      return diaryService.exportToDirectory(workspaceDb(), ledgerId, directory, year, month)
    },
  }
}
