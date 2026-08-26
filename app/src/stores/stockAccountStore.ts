import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import {
  addStockPrincipal,
  fetchStockFeeSettings,
  fetchStockFundRecords,
  fetchStockOverview,
  saveStockFeeSettings,
  setStockPrincipal,
} from '@/backend/api/stock'
import { withErrorHandling } from '@/backend/errorHandler'
import NotificationUtil from '@/backend/notification'
import { useLedgerStore } from '@/stores/ledgerStore'
import type { StockFeeSetting, StockFundRecordPage, StockOverview } from '@/types/transactions'

const EMPTY_OVERVIEW: StockOverview = {
  principal: 0,
  currentCash: 0,
  positionMarketValue: 0,
  totalAssets: 0,
  realizedPnl: 0,
  totalPnlPercent: 0,
}

const EMPTY_PAGE: StockFundRecordPage = { items: [], total: 0, page: 1, pageSize: 10 }

export const useStockAccountStore = defineStore('stockAccount', () => {
  const ledgerStore = useLedgerStore()

  const overview = ref<StockOverview>({ ...EMPTY_OVERVIEW })
  const feeSettings = ref<StockFeeSetting | null>(null)
  const fundRecords = ref<StockFundRecordPage>({ ...EMPTY_PAGE })

  const overviewLoading = ref(false)
  const feeSettingsLoading = ref(false)
  const recordsLoading = ref(false)
  const mutating = ref(false)

  const currentLedgerId = () => ledgerStore.currentLedgerId

  const loadOverview = async () => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) return
    overviewLoading.value = true
    try {
      const data = await withErrorHandling(
        () => fetchStockOverview(ledgerId),
        { errorPrefix: '查询股票账户总览失败', fallback: { ...EMPTY_OVERVIEW } }
      )
      overview.value = data ?? { ...EMPTY_OVERVIEW }
    } finally {
      overviewLoading.value = false
    }
  }

  const loadFeeSettings = async () => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) return
    feeSettingsLoading.value = true
    try {
      const data = await withErrorHandling(
        () => fetchStockFeeSettings(ledgerId),
        { errorPrefix: '查询交易费用设置失败', fallback: null }
      )
      feeSettings.value = data
    } finally {
      feeSettingsLoading.value = false
    }
  }

  const loadFundRecords = async (page = 1, pageSize = 10) => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) return
    recordsLoading.value = true
    try {
      const data = await withErrorHandling(
        () => fetchStockFundRecords(ledgerId, page, pageSize),
        { errorPrefix: '查询资金变化记录失败', fallback: { ...EMPTY_PAGE } }
      )
      fundRecords.value = data ?? { ...EMPTY_PAGE }
    } finally {
      recordsLoading.value = false
    }
  }

  const reloadAll = async () => {
    await Promise.all([loadOverview(), loadFeeSettings(), loadFundRecords(1)])
  }

  const runMutation = async <T>(fn: () => Promise<T>, successMsg: string, errorPrefix: string): Promise<T | null> => {
    mutating.value = true
    try {
      const result = await withErrorHandling(fn, { errorPrefix, rethrow: true })
      NotificationUtil.success(successMsg)
      await reloadAll()
      return result
    } catch {
      return null
    } finally {
      mutating.value = false
    }
  }

  const setPrincipal = (amount: number) =>
    runMutation(() => setStockPrincipal(currentLedgerId(), amount), '设置本金成功', '设置本金失败')

  const addPrincipal = (amount: number) =>
    runMutation(() => addStockPrincipal(currentLedgerId(), amount), '追加本金成功', '追加本金失败')

  const saveFeeSettingsAction = (commissionRate: number, minCommission: number, stampDutyRate: number, transferFeeRate: number) =>
    runMutation(
      () => saveStockFeeSettings(currentLedgerId(), commissionRate, minCommission, stampDutyRate, transferFeeRate),
      '费用设置已保存',
      '保存费用设置失败'
    )

  // 切换账本后自动重载股票账户数据
  watch(
    () => ledgerStore.currentLedgerId,
    () => {
      if (ledgerStore.currentLedgerId) {
        reloadAll()
      }
    }
  )

  return {
    overview,
    feeSettings,
    fundRecords,
    overviewLoading,
    feeSettingsLoading,
    recordsLoading,
    mutating,
    loadOverview,
    loadFeeSettings,
    loadFundRecords,
    reloadAll,
    setPrincipal,
    addPrincipal,
    saveFeeSettings: saveFeeSettingsAction,
  }
})
