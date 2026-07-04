import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { TransactionRecord, TrQueryCondition, TransactionTemplate } from '@/types/billadm'
import { queryTrOnCondition } from '@/backend/api/tr'
import { queryTemplates } from '@/backend/api/template'
import { withErrorHandling } from '@/backend/errorHandler'
import { convertToUnixTimeRange } from '@/backend/timerange'
import { useLedgerStore } from '@/stores/ledgerStore'
import { useTrQueryConditionStore } from '@/stores/trQueryConditionStore'

export interface SortItem {
  field: string
  order: 'asc' | 'desc'
}

export const useTransactionStore = defineStore('transaction', () => {
  const tableData = ref<TransactionRecord[]>([])
  const trTotal = ref(0)
  const currentPage = ref(1)
  const pageSize = ref(15)
  const tableLoading = ref(false)

  const sortItems = ref<SortItem[]>([{ field: 'transactionAt', order: 'desc' }])

  const templates = ref<TransactionTemplate[]>([])
  const templateOptions = ref<any[]>([])

  const fetchTransactions = async () => {
    const ledgerStore = useLedgerStore()
    const trQueryConditionStore = useTrQueryConditionStore()

    if (!ledgerStore.currentLedgerId) return

    tableLoading.value = true
    try {
      const trCondition: TrQueryCondition = {
        ledgerId: ledgerStore.currentLedgerId,
        offset: pageSize.value * (currentPage.value - 1),
        limit: pageSize.value,
        sortFields: sortItems.value
      }
      if (trQueryConditionStore.timeRange) {
        trCondition.tsRange = convertToUnixTimeRange(trQueryConditionStore.timeRange)
      }
      if (trQueryConditionStore.trQueryConditionItems) {
        trCondition.items = trQueryConditionStore.trQueryConditionItems
      }
      const trQueryResult = await withErrorHandling(
        () => queryTrOnCondition(trCondition),
        {
          errorPrefix: '查询消费记录失败',
          fallback: { items: [], total: 0, trStatistics: { income: 0, expense: 0, transfer: 0 } }
        }
      )

      tableData.value = trQueryResult.items
      trTotal.value = trQueryResult.total
      return trQueryResult.trStatistics
    } finally {
      tableLoading.value = false
    }
  }

  const loadTemplates = async () => {
    const ledgerStore = useLedgerStore()
    if (!ledgerStore.currentLedgerId) return

    const result = await withErrorHandling(
      () => queryTemplates(ledgerStore.currentLedgerId),
      { errorPrefix: '查询模板失败', fallback: [] as TransactionTemplate[] }
    )
    templates.value = result
    templateOptions.value = result.map(t => ({
      label: t.template_name,
      value: t.template_id,
      template: t,
    }))
  }

  return {
    tableData, trTotal, currentPage, pageSize, tableLoading,
    sortItems,
    templates, templateOptions,
    fetchTransactions, loadTemplates,
  }
})
