<template>
  <BilladmPageLayout>
    <template #toolbar>
      <div class="key-event-toolbar-left">
        <a-button type="text" @click="goToPrevYear">
          <template #icon><LeftOutlined /></template>
        </a-button>
        <span class="year-display">{{ selectedYear }}</span>
        <a-button type="text" @click="goToNextYear">
          <template #icon><RightOutlined /></template>
        </a-button>
      </div>
    </template>

    <!-- 三栏主体 -->
    <div class="key-event-body">
      <!-- 左栏：事件列表 280px -->
      <KeyEventList
        class="panel-left"
        :events="keyEventStore.events"
        :selected-date="selectedDate"
        @select="onSelectEvent"
        @delete="handleDeleteEvent"
        @add-event="openAddModal"
      />

      <!-- 中栏：事件详情 flex:1 -->
      <KeyEventDetail
        class="panel-center"
        :event="currentEvent"
        :images="keyEventStore.images"
        :is-editing="isEditing"
        :progress="uploadProgress"
        @edit="isEditing = true"
        @save="handleSaveContent"
        @cancel-edit="isEditing = false"
        @add-images="handleAddImages"
        @delete-image="handleDeleteImage"
        @color-change="handleColorChange"
        @retry-upload="handleRetryUpload"
        @skip-upload="handleSkipUpload"
      />

      <!-- 右栏：关联交易 320px -->
      <KeyEventLinkedTr
        class="panel-right"
        :transactions="linkedTransactions"
        :loading="false"
        :has-selection="!!selectedDate"
        @delete="handleUnlinkTr"
      />
    </div>

    <!-- 添加事件弹窗 -->
    <KeyEventAddModal
      :open="addModalOpen"
      :loading="addModalLoading"
      @confirm="handleAddEvent"
      @close="addModalOpen = false"
    />
  </BilladmPageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import dayjs, { type Dayjs } from 'dayjs'
import { LeftOutlined, RightOutlined } from '@ant-design/icons-vue'
import { useKeyEventStore } from '@/stores/keyEventStore'
import { useAppDataStore } from '@/stores/appDataStore'
import { withErrorHandling } from '@/backend/errorHandler'
import { fetchLinkedTransactions, unlinkTrFromKeyEvent } from '@/backend/api/tr'
import NotificationUtil from '@/backend/notification'
import { useTransactionStats } from '@/hooks/useTransactionStats'
import { useImageUpload } from '@/hooks/useImageUpload'
import type { KeyEvent, TransactionRecord } from '@/types/billadm'

const keyEventStore = useKeyEventStore()
const appDataStore = useAppDataStore()
const { computeFrom } = useTransactionStats()

// ========== 年份导航 ==========
const selectedYearDayjs = ref<Dayjs>(dayjs().year(keyEventStore.currentYear))
const selectedYear = ref(selectedYearDayjs.value.year())

const goToPrevYear = async () => {
  selectedYearDayjs.value = selectedYearDayjs.value.year(selectedYearDayjs.value.year() - 1)
  selectedYear.value = selectedYearDayjs.value.year()
  clearSelection()
  await keyEventStore.preloadYearData(selectedYear.value)
}

const goToNextYear = async () => {
  selectedYearDayjs.value = selectedYearDayjs.value.year(selectedYearDayjs.value.year() + 1)
  selectedYear.value = selectedYearDayjs.value.year()
  clearSelection()
  await keyEventStore.preloadYearData(selectedYear.value)
}

// ========== 选中事件 ==========
const selectedDate = ref('')
const currentEvent = ref<KeyEvent | null>(null)
const isEditing = ref(false)

const clearSelection = () => {
  selectedDate.value = ''
  currentEvent.value = null
  isEditing.value = false
  keyEventStore.clearImages()
  appDataStore.setStatistics({ income: 0, expense: 0, transfer: 0 })
  resetUpload()
}

const onSelectEvent = async (date: string) => {
  selectedDate.value = date
  isEditing.value = false

  // 从 events 缓存取事件内容
  const event = keyEventStore.getEventByDate(date)
  currentEvent.value = event ?? null

  if (!event) return

  // 从 imageCache 取图片（调用 fetchImages 会自动走缓存）
  await keyEventStore.fetchImages(date)

  // 从 trCache 取关联交易
  const cachedTrs = keyEventStore.trCache.get(date)
  if (cachedTrs !== undefined) {
    linkedTransactions.value = cachedTrs
    appDataStore.setStatistics(computeFrom(cachedTrs))
  } else {
    // 缓存未命中则走原路径
    await loadLinkedTransactions(date)
    keyEventStore.cacheLinkedTransactions(date)
  }
}

// ========== 编辑描述 ==========
const handleSaveContent = async (content: string) => {
  if (!currentEvent.value) return
  const title = currentEvent.value.title || extractTitle(content)
  try {
    await keyEventStore.saveEvent(selectedDate.value, title, content, currentEvent.value.color)
    await keyEventStore.fetchDatesByYear(selectedYear.value)
    isEditing.value = false
    // 直接从缓存取（saveEvent 已更新 events 数组）
    currentEvent.value = keyEventStore.getEventByDate(selectedDate.value)
  } catch { /* error handled in store */ }
}

const extractTitle = (content: string): string => {
  const firstLine = content.split('\n')[0]?.trim() ?? ''
  return firstLine.length > 200 ? firstLine.slice(0, 200) : firstLine
}

// ========== 删除事件 ==========
const handleDeleteEvent = async (date: string) => {
  try {
    await keyEventStore.deleteEvent(date)
    if (selectedDate.value === date) {
      clearSelection()
    }
  } catch { /* error handled in store */ }
}

// ========== 图片管理 ==========
const { progress: uploadProgress, addFiles, retry, skip, reset: resetUpload } = useImageUpload(
  (date, data, onProgress) => keyEventStore.addImage(date, data, onProgress)
)

const handleAddImages = async (files: File[]) => {
  await addFiles(selectedDate.value, files)
}

const handleRetryUpload = async () => {
  await retry()
}

const handleSkipUpload = async () => {
  await skip()
}

const handleDeleteImage = async (imageId: string) => {
  try {
    await keyEventStore.removeImage(imageId)
  } catch { /* error handled in store */ }
}

// ========== 关联交易 ==========
const linkedTransactions = ref<TransactionRecord[]>([])

const loadLinkedTransactions = async (date: string) => {
  try {
    linkedTransactions.value = await withErrorHandling(
      () => fetchLinkedTransactions(date),
      { errorPrefix: '查询关联交易失败', fallback: [] as TransactionRecord[] }
    )
    // 同步关联交易汇总到全局统计
    appDataStore.setStatistics(computeFrom(linkedTransactions.value))
  } catch {
    linkedTransactions.value = []
  }
}

const handleUnlinkTr = async (transactionId: string) => {
  try {
    await withErrorHandling(
      () => unlinkTrFromKeyEvent(transactionId),
      { errorPrefix: '解除关联失败', rethrow: true }
    )
    NotificationUtil.success('已解除关联')
    linkedTransactions.value = linkedTransactions.value.filter(
      t => t.transactionId !== transactionId
    )
    // 同步 trCache
    if (selectedDate.value) {
      keyEventStore.trCache.set(selectedDate.value, [...linkedTransactions.value])
    }
    // 重新计算并同步统计
    appDataStore.setStatistics(computeFrom(linkedTransactions.value))
  } catch {
    // 错误已在 withErrorHandling 中通知
  }
}

// ========== 添加事件弹窗 ==========
const addModalOpen = ref(false)
const addModalLoading = ref(false)

const openAddModal = () => {
  addModalOpen.value = true
}

const handleAddEvent = async (date: string, title: string) => {
  addModalLoading.value = true
  try {
    await keyEventStore.saveEvent(date, title, '', '')
    addModalOpen.value = false
    // 刷新列表并选中新事件
    await keyEventStore.fetchDatesByYear(selectedYear.value)
    onSelectEvent(date)
  } catch {
    /* error handled in store */
  } finally {
    addModalLoading.value = false
  }
}

const handleColorChange = async (color: string) => {
  if (!currentEvent.value) return
  const title = currentEvent.value.title || ''
  const content = currentEvent.value.content || ''
  try {
    await keyEventStore.saveEvent(selectedDate.value, title, content, color)
    await keyEventStore.fetchDatesByYear(selectedYear.value)
    currentEvent.value = keyEventStore.getEventByDate(selectedDate.value)
  } catch {
    /* error handled in store */
  }
}

// ========== 初始化 ==========
onMounted(async () => {
  await keyEventStore.preloadYearData(selectedYear.value)
  selectedDate.value = ''
})
</script>

<style scoped>
.key-event-toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-md);
}

.year-display {
  font-size: var(--billadm-size-text-display-sm);
  font-weight: 600;
  color: var(--billadm-color-text-major);
  min-width: 80px;
  text-align: center;
  line-height: 32px;
}

/* 三栏主体 */
.key-event-body {
  flex: 1;
  display: grid;
  grid-template-columns: 280px 1fr 280px;
  gap: var(--billadm-space-lg);
  min-height: 0;
  overflow: hidden;
}

.panel-left {
  height: 100%;
  overflow: hidden;
  contain: layout style;
}

.panel-center {
  height: 100%;
  overflow: hidden;
  contain: layout style;
}

.panel-right {
  height: 100%;
  overflow: hidden;
  contain: layout style;
}

</style>
