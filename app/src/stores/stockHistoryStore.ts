import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { fetchStockTradeHistories, fetchStockTradeHistoryDetail, fetchStockTradeHistorySummary } from '@/backend/api/stock'
import { withErrorHandling } from '@/backend/errorHandler'
import { useLedgerStore } from '@/stores/ledgerStore'
import type { StockTradeHistory, StockTradeHistoryDetail, StockTradeHistorySummary } from '@/types/transactions'

export const useStockHistoryStore = defineStore('stockHistory', () => {
  const ledgerStore = useLedgerStore()

  const histories = ref<StockTradeHistory[]>([])
  const historiesLoading = ref(false)
  const selectedCode = ref('')
  const detail = ref<StockTradeHistoryDetail | null>(null)
  const detailLoading = ref(false)
  const summary = ref<StockTradeHistorySummary | null>(null)
  const summaryLoading = ref(false)

  const currentLedgerId = () => ledgerStore.currentLedgerId

  const loadHistories = async (preferCode = '') => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) return
    historiesLoading.value = true
    summaryLoading.value = true
    try {
      const [data, summaryData] = await Promise.all([
        withErrorHandling(
          () => fetchStockTradeHistories(ledgerId),
          { errorPrefix: '查询交易历史失败', fallback: [] as StockTradeHistory[] }
        ),
        withErrorHandling(
          () => fetchStockTradeHistorySummary(ledgerId),
          { errorPrefix: '查询交易历史总览失败', fallback: null as StockTradeHistorySummary | null }
        ),
      ])
      histories.value = data ?? []
      summary.value = summaryData
      // 保持当前选中；选中的股票已不存在时自动切到最近清仓的一只
      const stillThere = histories.value.find((h) => h.stockCode === selectedCode.value)
      if (!stillThere) {
        const target = preferCode || histories.value[0]?.stockCode || ''
        if (target !== selectedCode.value) {
          selectedCode.value = target
          if (target) {
            await loadDetail(target)
          } else {
            detail.value = null
          }
        }
      }
    } finally {
      historiesLoading.value = false
      summaryLoading.value = false
    }
  }

  const loadDetail = async (stockCode = selectedCode.value) => {
    const ledgerId = currentLedgerId()
    if (!ledgerId || !stockCode) {
      detail.value = null
      return
    }
    detailLoading.value = true
    try {
      const data = await withErrorHandling(
        () => fetchStockTradeHistoryDetail(ledgerId, stockCode),
        { errorPrefix: '查询交易历史详情失败', fallback: null as StockTradeHistoryDetail | null }
      )
      detail.value = data
    } finally {
      detailLoading.value = false
    }
  }

  const selectStock = async (stockCode: string) => {
    if (stockCode === selectedCode.value) return
    selectedCode.value = stockCode
    await loadDetail(stockCode)
  }

  const reload = async (preferCode = '') => {
    await loadHistories(preferCode)
    if (selectedCode.value) {
      await loadDetail()
    }
  }

  watch(
    () => ledgerStore.currentLedgerId,
    () => {
      if (ledgerStore.currentLedgerId) {
        selectedCode.value = ''
        reload()
      }
    }
  )

  return {
    histories,
    historiesLoading,
    summary,
    summaryLoading,
    selectedCode,
    detail,
    detailLoading,
    loadHistories,
    loadDetail,
    selectStock,
    reload,
  }
})
