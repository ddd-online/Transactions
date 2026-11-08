/**
 * 记账类命令：账本的增删改查与交易记录的读写 / 关联。
 *
 * 图表数据的聚合查询在 handlers/charts.ts（唯一调用方是图表页）。
 */
import { AppError } from '../../../shared/errors'
import type {
  TransactionRecordDto,
  TrQueryCondition,
} from '../../../shared/types/transaction'
import {
  createLedger,
  deleteLedgerById,
  listAllLedgers,
  modifyLedger,
  queryLedgerById,
} from '../../services/ledger'
import * as transactionService from '../../services/transaction-record'
import type { HandlerMap } from '../commands'
import { asObject, workspaceDb, type HandlerContext } from './context'

export function createRecordHandlers(
  _ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'ledger_list'
  | 'ledger_create'
  | 'ledger_get'
  | 'ledger_update'
  | 'ledger_delete'
  | 'tr_query'
  | 'tr_create'
  | 'tr_batch_create'
  | 'tr_delete'
  | 'tr_link'
  | 'tr_unlink'
  | 'tr_linked_by_date'
> {
  return {
    ledger_list(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) {
        throw new AppError('missing required query parameter: id', { status: 400 })
      }
      const db = workspaceDb()
      if (id === 'all') return listAllLedgers(db)
      return id.split(',').map((raw) => {
        const ledgerId = raw.trim()
        try {
          return queryLedgerById(db, ledgerId)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          throw new AppError(`查询账本 ${ledgerId} 失败: ${message}`, { status: 500 })
        }
      })
    },

    ledger_create(request) {
      const raw = asObject(request)
      if (typeof raw.name !== 'string') {
        throw new AppError('name在请求体中不存在', { status: 400 })
      }
      const description = typeof raw.description === 'string' ? raw.description : ''
      return createLedger(workspaceDb(), raw.name, description)
    },

    ledger_get(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('missing ledger id', { status: 400 })
      return queryLedgerById(workspaceDb(), id)
    },

    ledger_update(request) {
      const raw = asObject(request)
      const id = String(raw.id ?? '')
      if (!id) throw new AppError('missing ledger id', { status: 400 })
      if (typeof raw.name !== 'string') {
        throw new AppError('name在请求体中不存在', { status: 400 })
      }
      const description = typeof raw.description === 'string' ? raw.description : ''
      modifyLedger(workspaceDb(), id, raw.name, description)
      return null
    },

    ledger_delete(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('missing ledger id', { status: 400 })
      deleteLedgerById(workspaceDb(), id)
      return null
    },

    tr_query(request) {
      return transactionService.queryTrsOnCondition(workspaceDb(), request as TrQueryCondition)
    },

    tr_create(request) {
      return transactionService.createTr(workspaceDb(), request as TransactionRecordDto)
    },

    tr_batch_create(request) {
      const dtos = request as TransactionRecordDto[]
      dtos.forEach((dto, index) => {
        try {
          transactionService.validateTransactionDto(dto)
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          throw new AppError(`record ${index + 1}: ${message}`, { status: 400 })
        }
      })
      return transactionService.batchCreateTr(workspaceDb(), dtos)
    },

    tr_delete(request) {
      const id = String(asObject(request).id ?? '')
      if (!id) throw new AppError('missing transaction id', { status: 400 })
      transactionService.deleteTrById(workspaceDb(), id)
      return null
    },

    tr_link(request) {
      const raw = asObject(request)
      const transactionId = String(raw.transaction_id ?? '')
      const date = String(raw.date ?? '')
      if (!transactionId || !date) {
        throw new AppError('transaction_id and date are required', { status: 400 })
      }
      transactionService.linkToKeyEvent(workspaceDb(), transactionId, date)
      return date
    },

    tr_unlink(request) {
      const transactionId = String(asObject(request).transaction_id ?? '')
      if (!transactionId) {
        throw new AppError('transaction_id is required', { status: 400 })
      }
      transactionService.unlinkFromKeyEvent(workspaceDb(), transactionId)
      return transactionId
    },

    tr_linked_by_date(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledger_id ?? '')
      const date = String(raw.date ?? '')
      if (!date) throw new AppError('date is required', { status: 400 })
      if (!ledgerId) throw new AppError('ledger_id is required', { status: 400 })
      return transactionService.queryLinkedByDate(workspaceDb(), ledgerId, date)
    },
  }
}
