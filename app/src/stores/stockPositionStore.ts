import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  createStockTrade,
  fetchStockPositions,
  fetchStockTrades,
} from '@/backend/api/stock'
import { withErrorHandling } from '@/backend/errorHandler'
import NotificationUtil from '@/backend/notification'
import { useLedgerStore } from '@/stores/ledgerStore'
import { useStockAccountStore } from '@/stores/stockAccountStore'
import { useStockHistoryStore } from '@/stores/stockHistoryStore'
import { useStockStatisticsStore } from '@/stores/stockStatisticsStore'
import type { StockPosition, StockTrade } from '@/types/transactions'

export const useStockPositionStore = defineStore('stockPosition', () => {
  const ledgerStore = useLedgerStore()
  const stockAccountStore = useStockAccountStore()
  const stockHistoryStore = useStockHistoryStore()
  const stockStatisticsStore = useStockStatisticsStore()

  const positions = ref<StockPosition[]>([])
  const positionsLoading = ref(false)
  const selectedCode = ref('')
  const trades = ref<StockTrade[]>([])
  const tradesLoading = ref(false)
  const mutating = ref(false)

  const currentLedgerId = () => ledgerStore.currentLedgerId

  const loadPositions = async (preferCode = '') => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) return
    positionsLoading.value = true
    try {
      const data = await withErrorHandling(
        () => fetchStockPositions(ledgerId),
        { errorPrefix: '查询持仓失败', fallback: [] as StockPosition[] }
      )
      positions.value = data ?? []
      // 保持当前选中；选中已清仓或不存在时自动切到第一只
      const stillHeld = positions.value.find((p) => p.stockCode === selectedCode.value)
      if (!stillHeld) {
        const target = preferCode || positions.value[0]?.stockCode || ''
        if (target !== selectedCode.value) {
          selectedCode.value = target
          if (target) {
            await loadTrades(target)
          } else {
            trades.value = []
          }
        }
      }
    } finally {
      positionsLoading.value = false
    }
  }

  const loadTrades = async (stockCode = selectedCode.value) => {
    const ledgerId = currentLedgerId()
    if (!ledgerId || !stockCode) {
      trades.value = []
      return
    }
    tradesLoading.value = true
    try {
      const data = await withErrorHandling(
        () => fetchStockTrades(ledgerId, stockCode),
        { errorPrefix: '查询交易历史失败', fallback: [] as StockTrade[] }
      )
      trades.value = data ?? []
    } finally {
      tradesLoading.value = false
    }
  }

  const selectStock = async (stockCode: string) => {
    if (stockCode === selectedCode.value) return
    selectedCode.value = stockCode
    await loadTrades(stockCode)
  }

  const reloadAll = async () => {
    await loadPositions()
    if (selectedCode.value) {
      await loadTrades()
    }
  }

  const recordTrade = async (input: {
    stockCode: string
    stockName: string
    tradeType: 'open' | 'add' | 'reduce' | 'close'
    price: number
    lots: number
    tradeTime: number
    remark: string
  }): Promise<boolean> => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) return false
    mutating.value = true
    try {
      await withErrorHandling(
        () => createStockTrade(
          ledgerId,
          input.stockCode,
          input.stockName,
          input.tradeType,
          input.price,
          input.lots,
          input.tradeTime,
          input.remark
        ),
        { errorPrefix: '记录交易失败', rethrow: true }
      )
      NotificationUtil.success('交易已记录')
      await loadPositions(input.stockCode)
      // 清仓后该股不在持仓，切到该股查看最终交易历史；否则保持选中并刷新
      if (input.stockCode && !positions.value.some((p) => p.stockCode === input.stockCode)) {
        selectedCode.value = input.stockCode
        await loadTrades(input.stockCode)
        // 清仓会生成一笔新的交易历史轮次，同步刷新历史页与交易统计
        await stockHistoryStore.reload(input.stockCode)
        await stockStatisticsStore.loadStats()
      } else if (selectedCode.value) {
        await loadTrades(selectedCode.value)
      }
      // 同步刷新「我的账户」总览与资金变化记录（每笔交易都会产生资金记录）
      await stockAccountStore.reloadAll()
      return true
    } catch {
      return false
    } finally {
      mutating.value = false
    }
  }

  watch(
    () => ledgerStore.currentLedgerId,
    () => {
      if (ledgerStore.currentLedgerId) {
        selectedCode.value = ''
        reloadAll()
      }
    }
  )

  return {
    positions,
    positionsLoading,
    selectedCode,
    trades,
    tradesLoading,
    mutating,
    loadPositions,
    loadTrades,
    selectStock,
    reloadAll,
    recordTrade,
  }
})
