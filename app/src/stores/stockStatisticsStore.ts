import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { fetchStockStatistics } from '@/backend/api/stock'
import { withErrorHandling } from '@/backend/errorHandler'
import { useLedgerStore } from '@/stores/ledgerStore'
import type { StockStatistics } from '@/types/transactions'

export const useStockStatisticsStore = defineStore('stockStatistics', () => {
  const ledgerStore = useLedgerStore()

  const stats = ref<StockStatistics | null>(null)
  const loading = ref(false)

  const currentLedgerId = () => ledgerStore.currentLedgerId

  const loadStats = async () => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) {
      stats.value = null
      return
    }
    loading.value = true
    try {
      const data = await withErrorHandling(
        () => fetchStockStatistics(ledgerId),
        { errorPrefix: '查询交易统计失败', fallback: null as StockStatistics | null }
      )
      stats.value = data
    } finally {
      loading.value = false
    }
  }

  watch(
    () => ledgerStore.currentLedgerId,
    () => {
      if (ledgerStore.currentLedgerId) {
        loadStats()
      }
    }
  )

  return {
    stats,
    loading,
    loadStats,
  }
})
