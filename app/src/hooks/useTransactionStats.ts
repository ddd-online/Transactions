import { ref } from 'vue'
import type { TransactionRecord } from '@/types/billadm'

export interface TransactionStats {
  income: number
  expense: number
  transfer: number
}

export function useTransactionStats() {
  const stats = ref<TransactionStats>({ income: 0, expense: 0, transfer: 0 })

  function computeFrom(transactions: TransactionRecord[]): TransactionStats {
    let income = 0, expense = 0, transfer = 0
    for (const t of transactions) {
      if (t.transactionType === 'income') income += t.price
      else if (t.transactionType === 'expense') expense += t.price
      else if (t.transactionType === 'transfer') transfer += t.price
    }
    const result = { income, expense, transfer }
    stats.value = result
    return result
  }

  function reset() {
    stats.value = { income: 0, expense: 0, transfer: 0 }
  }

  return {
    stats,
    computeFrom,
    reset,
  }
}
