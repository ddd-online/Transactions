/**
 * 待办命令：卡片、事项、进度记录与历史。
 *
 * 排序 / 到期 / 四象限的计算在 services/todo 与 shared 域里，这里只做参数解析。
 */
import { AppError } from '../../../shared/errors'
import * as todoService from '../../services/todo'
import type { HandlerMap } from '../commands'
import { asObject, workspaceDb, type HandlerContext } from './context'

export function createTodoHandlers(
  _ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'todo_cards'
  | 'todo_history'
  | 'todo_card_create'
  | 'todo_card_delete'
  | 'todo_card_sort'
  | 'todo_item_create'
  | 'todo_item_update'
  | 'todo_item_status'
  | 'todo_item_delete'
  | 'todo_progress_add'
  | 'todo_progress_delete'
  | 'todo_progress_done'
> {
  return {
    todo_cards(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.listCards(workspaceDb(), ledgerId)
    },

    todo_history(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.listHistory(workspaceDb(), ledgerId)
    },

    todo_card_create(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.createCard(
        workspaceDb(),
        ledgerId,
        typeof raw.title === 'string' ? raw.title : '',
      )
    },

    todo_card_delete(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('id is required', { status: 400 })
      todoService.deleteCard(workspaceDb(), id)
      return null
    },

    todo_card_sort(request) {
      const raw = asObject(request)
      const id = String(raw.id ?? '')
      if (!id) throw new AppError('id is required', { status: 400 })
      todoService.updateCardSort(workspaceDb(), id, Number(raw.sort_order ?? 0))
      return null
    },

    todo_item_create(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.createItem(
        workspaceDb(),
        ledgerId,
        String(raw.card_id ?? ''),
        typeof raw.title === 'string' ? raw.title : '',
        typeof raw.start_date === 'string' ? raw.start_date : '',
        typeof raw.due_date === 'string' ? raw.due_date : '',
        Number(raw.urgency ?? 0),
        Number(raw.importance ?? 0),
      )
    },

    todo_item_update(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.updateItem(
        workspaceDb(),
        ledgerId,
        String(raw.id ?? ''),
        typeof raw.title === 'string' ? raw.title : '',
        typeof raw.start_date === 'string' ? raw.start_date : '',
        typeof raw.due_date === 'string' ? raw.due_date : '',
        Number(raw.urgency ?? 0),
        Number(raw.importance ?? 0),
      )
    },

    todo_item_status(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.setItemStatus(
        workspaceDb(),
        ledgerId,
        String(raw.id ?? ''),
        typeof raw.status === 'string' ? raw.status : '',
      )
    },

    todo_item_delete(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('id is required', { status: 400 })
      todoService.deleteItem(workspaceDb(), id)
      return null
    },

    todo_progress_add(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return todoService.addProgress(
        workspaceDb(),
        ledgerId,
        String(raw.item_id ?? ''),
        typeof raw.content === 'string' ? raw.content : '',
      )
    },

    todo_progress_delete(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('id is required', { status: 400 })
      todoService.deleteProgress(workspaceDb(), id)
      return null
    },

    todo_progress_done(request) {
      const raw = asObject(request)
      const id = String(raw.id ?? '')
      if (!id) throw new AppError('id is required', { status: 400 })
      todoService.setProgressDone(workspaceDb(), id, raw.done === true)
      return null
    },
  }
}
