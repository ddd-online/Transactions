import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  createStockTrade,
  fetchStockJournal,
  fetchStockPositions,
  fetchStockTrades,
  saveStockJournal,
} from '@/backend/api/stock'
import { withErrorHandling } from '@/backend/errorHandler'
import NotificationUtil from '@/backend/notification'
import { useLedgerStore } from '@/stores/ledgerStore'
import type { StockJournal, StockPosition, StockTrade } from '@/types/transactions'

export const useStockPositionStore = defineStore('stockPosition', () => {
  const ledgerStore = useLedgerStore()

  const positions = ref<StockPosition[]>([])
  const positionsLoading = ref(false)
  const selectedCode = ref('')
  const trades = ref<StockTrade[]>([])
  const tradesLoading = ref(false)
  const journal = ref<StockJournal | null>(null)
  const journalLoading = ref(false)
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
            await Promise.all([loadTrades(target), loadJournal(target)])
          } else {
            trades.value = []
            journal.value = null
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
        { errorPrefix: '查询交易记录失败', fallback: [] as StockTrade[] }
      )
      trades.value = data ?? []
    } finally {
      tradesLoading.value = false
    }
  }

  const loadJournal = async (stockCode = selectedCode.value) => {
    const ledgerId = currentLedgerId()
    if (!ledgerId || !stockCode) {
      journal.value = null
      return
    }
    journalLoading.value = true
    try {
      const data = await withErrorHandling(
        () => fetchStockJournal(ledgerId, stockCode),
        { errorPrefix: '查询交易日志失败', fallback: null as StockJournal | null }
      )
      journal.value = data
    } finally {
      journalLoading.value = false
    }
  }

  const selectStock = async (stockCode: string) => {
    if (stockCode === selectedCode.value) return
    selectedCode.value = stockCode
    await Promise.all([loadTrades(stockCode), loadJournal(stockCode)])
  }

  const reloadAll = async () => {
    await loadPositions()
    if (selectedCode.value) {
      await Promise.all([loadTrades(), loadJournal()])
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
      return true
    } catch {
      return false
    } finally {
      mutating.value = false
    }
  }

  const saveJournal = async (rules: string, plan: string, review: string): Promise<boolean> => {
    const ledgerId = currentLedgerId()
    if (!ledgerId || !selectedCode.value || !journal.value) return false
    mutating.value = true
    try {
      const position = positions.value.find((p) => p.stockCode === selectedCode.value)
      const stockName = position?.stockName ?? journal.value.stockName
      const data = await withErrorHandling(
        () => saveStockJournal(ledgerId, selectedCode.value, stockName, rules, plan, review),
        { errorPrefix: '保存交易日志失败', rethrow: true }
      )
      journal.value = data
      NotificationUtil.success('交易日志已保存')
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
    journal,
    journalLoading,
    mutating,
    loadPositions,
    loadTrades,
    loadJournal,
    selectStock,
    reloadAll,
    recordTrade,
    saveJournal,
  }
})
