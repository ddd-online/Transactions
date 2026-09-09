import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { fetchStockTradeTagSettings, saveStockTradeTagSettings } from '@/backend/api/stock'
import { withErrorHandling } from '@/backend/errorHandler'
import { useLedgerStore } from '@/stores/ledgerStore'
import type { StockTradeTagSetting } from '@/types/transactions'

export const useStockTagStore = defineStore('stockTag', () => {
  const ledgerStore = useLedgerStore()

  const tags = ref<string[]>([])
  const defaultTag = ref('分析')
  const loading = ref(false)
  const saving = ref(false)
  const loadedLedgerId = ref('')

  const currentLedgerId = () => ledgerStore.currentLedgerId

  const load = async (force = false) => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) {
      tags.value = []
      defaultTag.value = '分析'
      loadedLedgerId.value = ''
      return
    }
    if (!force && loadedLedgerId.value === ledgerId && tags.value.length > 0) return
    loading.value = true
    try {
      const data = await withErrorHandling(
        () => fetchStockTradeTagSettings(ledgerId),
        { errorPrefix: '查询交易标签失败', fallback: null as StockTradeTagSetting | null }
      )
      if (data) {
        tags.value = data.tags ?? []
        defaultTag.value = data.defaultTag || '分析'
        loadedLedgerId.value = ledgerId
      }
    } finally {
      loading.value = false
    }
  }

  const save = async (nextTags: string[]): Promise<boolean> => {
    const ledgerId = currentLedgerId()
    if (!ledgerId) return false
    saving.value = true
    try {
      const data = await withErrorHandling(
        () => saveStockTradeTagSettings(ledgerId, nextTags),
        { errorPrefix: '保存交易标签失败', rethrow: true }
      )
      tags.value = data.tags
      defaultTag.value = data.defaultTag || '分析'
      loadedLedgerId.value = ledgerId
      return true
    } catch {
      return false
    } finally {
      saving.value = false
    }
  }

  watch(
    () => ledgerStore.currentLedgerId,
    () => {
      tags.value = []
      defaultTag.value = '分析'
      loadedLedgerId.value = ''
      if (ledgerStore.currentLedgerId) {
        load()
      }
    }
  )

  return {
    tags,
    defaultTag,
    loading,
    saving,
    load,
    save,
  }
})
