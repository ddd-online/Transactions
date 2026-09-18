import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  createStockTrade,
  deleteStockTradeOrder,
  fetchStockPositions,
  fetchStockTrades,
  previewStockTradeImpact,
  updateStockTradeFill,
  updateStockPositionReview,
} from '@/backend/api/stock'
import { withErrorHandling } from '@/backend/errorHandler'
import NotificationUtil from '@/backend/notification'
import { useLedgerStore } from '@/stores/ledgerStore'
import { useStockAccountStore } from '@/stores/stockAccountStore'
import { useStockHistoryStore } from '@/stores/stockHistoryStore'
import { useStockStatisticsStore } from '@/stores/stockStatisticsStore'
import type { StockPosition, StockTrade, StockTradeFillInput, StockTradeImpact, StockTradeTag } from '@/types/transactions'

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
  const quotesRefreshing = ref(false)
  const reviewSaving = ref(false)

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

  // 重新获取行情：刷新持仓（接口附带最新价/昨收）并同步刷新账户总览的市值与浮动盈亏
  const refreshQuotes = async () => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) return
    quotesRefreshing.value = true
    try {
      await loadPositions()
      await stockAccountStore.loadOverview()
    } finally {
      quotesRefreshing.value = false
    }
  }

  const reloadAll = async () => {
    await loadPositions()
    if (selectedCode.value) {
      await loadTrades()
    }
  }

  // 本轮复盘：持仓期间先写在持仓上（清仓归档时带入该轮次），只更新本地对应持仓的字段，
  // 不重拉持仓列表，避免为了保存一段文字再打一次行情接口。
  const savePositionReview = async (stockCode: string, review: string): Promise<boolean> => {
    const ledgerId = currentLedgerId()
    if (!ledgerId || !stockCode) return false
    reviewSaving.value = true
    try {
      const data = await withErrorHandling(
        () => updateStockPositionReview(ledgerId, stockCode, review),
        { errorPrefix: '保存本轮复盘失败', rethrow: true }
      )
      const target = positions.value.find((p) => p.stockCode === data.stockCode)
      if (target) target.review = data.review
      NotificationUtil.success('本轮复盘已保存')
      return true
    } catch {
      return false
    } finally {
      reviewSaving.value = false
    }
  }

  // 交易写操作后的统一刷新：持仓、交易记录、账户总览/资金记录，
  // 以及受影响的交易历史轮次与交易统计（编辑/删除会重算轮次）。
  const reloadAfterMutation = async (stockCode: string, refreshHistory = false) => {
    await loadPositions(stockCode)
    // 清仓后该股不在持仓，切到该股查看最终交易历史；否则保持选中并刷新
    if (stockCode && !positions.value.some((p) => p.stockCode === stockCode)) {
      selectedCode.value = stockCode
      await loadTrades(stockCode)
    } else if (selectedCode.value) {
      await loadTrades(selectedCode.value)
    }
    if (refreshHistory) {
      await stockHistoryStore.reload(stockCode)
      await stockStatisticsStore.loadStats()
    }
    // 同步刷新「我的账户」总览与资金变化记录（一笔委托产生一条资金记录）
    await stockAccountStore.reloadAll()
  }

  const recordTrade = async (input: {
    stockCode: string
    stockName: string
    tradeType: 'open' | 'add' | 'reduce' | 'close'
    fills: StockTradeFillInput[]
    tradeTime: number
    remark: string
    tag: StockTradeTag
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
          input.fills,
          input.tradeTime,
          input.remark,
          input.tag
        ),
        { errorPrefix: '记录交易失败', rethrow: true }
      )
      NotificationUtil.success('交易已记录')
      await reloadAfterMutation(input.stockCode, true)
      return true
    } catch {
      return false
    } finally {
      mutating.value = false
    }
  }

  // 编辑一笔成交：所属委托费用与持仓、资金记录、轮次由后端重算
  const updateTradeFill = async (
    tradeId: string,
    price: number,
    lots: number,
    tradeTime: number,
    stockCode: string
  ): Promise<boolean> => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) return false
    mutating.value = true
    try {
      await withErrorHandling(
        () => updateStockTradeFill(ledgerId, tradeId, price, lots, tradeTime),
        { errorPrefix: '保存成交失败', rethrow: true }
      )
      NotificationUtil.success('成交已更新')
      await reloadAfterMutation(stockCode, true)
      return true
    } catch {
      return false
    } finally {
      mutating.value = false
    }
  }

  // 删除整笔委托（含全部成交明细）后重算持仓、资金记录与轮次
  const deleteTradeOrder = async (orderId: string, stockCode: string): Promise<boolean> => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) return false
    mutating.value = true
    try {
      await withErrorHandling(
        () => deleteStockTradeOrder(ledgerId, orderId),
        { errorPrefix: '删除委托失败', rethrow: true }
      )
      NotificationUtil.success('委托已删除')
      await reloadAfterMutation(stockCode, true)
      return true
    } catch {
      return false
    } finally {
      mutating.value = false
    }
  }

  const previewTradeImpact = async (payload: {
    action: 'update_trade' | 'delete_order'
    tradeId?: string
    orderId?: string
    price?: number
    lots?: number
    tradeTime?: number
  }): Promise<StockTradeImpact | null> => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) return null
    return withErrorHandling(
      () => previewStockTradeImpact(ledgerId, payload),
      { errorPrefix: '预演交易影响失败', fallback: null as StockTradeImpact | null }
    )
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
    quotesRefreshing,
    reviewSaving,
    loadPositions,
    loadTrades,
    selectStock,
    refreshQuotes,
    reloadAll,
    recordTrade,
    updateTradeFill,
    deleteTradeOrder,
    previewTradeImpact,
    savePositionReview,
  }
})
