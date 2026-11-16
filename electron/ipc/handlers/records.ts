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
  | 'ledger_delete'
  | 'tr_query'
  | 'tr_create'
  | 'tr_batch_create'
  | 'tr_delete'
  | 'tr_link'
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
  }
}
