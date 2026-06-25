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
        @edit="isEditing = true"
        @save="handleSaveContent"
        @cancel-edit="isEditing = false"
        @add-image="handleAddImage"
        @delete-image="handleDeleteImage"
        @color-change="handleColorChange"
      />

      <!-- 右栏：关联交易 320px -->
      <KeyEventLinkedTr
        class="panel-right"
        :transactions="linkedTransactions"
        :loading="linkedLoading"
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

<script lang="ts">
const HEIC_EXTENSIONS = ['.heic', '.heif']
</script>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import dayjs, { type Dayjs } from 'dayjs'
import { LeftOutlined, RightOutlined } from '@ant-design/icons-vue'
import { useKeyEventStore } from '@/stores/keyEventStore'
import { useAppDataStore } from '@/stores/appDataStore'
import { getLinkedTransactions, unlinkTransactionFromKeyEvent } from '@/backend/functions'
import { message } from 'ant-design-vue'
import heic2any from 'heic2any'
import type { KeyEvent, TransactionRecord } from '@/types/billadm'

const keyEventStore = useKeyEventStore()
const appDataStore = useAppDataStore()

// ========== 年份导航 ==========
const selectedYearDayjs = ref<Dayjs>(dayjs())
const selectedYear = ref(selectedYearDayjs.value.year())

const goToPrevYear = () => {
  selectedYearDayjs.value = selectedYearDayjs.value.year(selectedYearDayjs.value.year() - 1)
  selectedYear.value = selectedYearDayjs.value.year()
  clearSelection()
  keyEventStore.fetchDatesByYear(selectedYear.value)
}

const goToNextYear = () => {
  selectedYearDayjs.value = selectedYearDayjs.value.year(selectedYearDayjs.value.year() + 1)
  selectedYear.value = selectedYearDayjs.value.year()
  clearSelection()
  keyEventStore.fetchDatesByYear(selectedYear.value)
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
}

const onSelectEvent = async (date: string) => {
  selectedDate.value = date
  isEditing.value = false
  try {
    const event = await keyEventStore.fetchEventByDate(date)
    currentEvent.value = event
    keyEventStore.fetchImages(date)
    loadLinkedTransactions(date)
  } catch {
    currentEvent.value = null
  }
}

// ========== 编辑描述 ==========
const handleSaveContent = async (content: string) => {
  if (!currentEvent.value) return
  const title = currentEvent.value.title || extractTitle(content)
  try {
    await keyEventStore.saveEvent(selectedDate.value, title, content, currentEvent.value.color)
    // 刷新列表以更新 title/content
    await keyEventStore.fetchDatesByYear(selectedYear.value)
    isEditing.value = false
    const updated = await keyEventStore.fetchEventByDate(selectedDate.value)
    currentEvent.value = updated
    message.success('保存成功')
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
const imageUploading = ref(false)

const fileToBase64 = async (file: File): Promise<string> => {
  const isHeic = HEIC_EXTENSIONS.some(ext =>
    file.name.toLowerCase().endsWith(ext)
  )

  if (!isHeic) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('读取文件失败'))
      reader.readAsDataURL(file)
    })
  }

  try {
    const jpegBlob = await heic2any({
      blob: file,
      toType: 'image/jpeg',
      quality: 0.92,
      multiple: false,
    }) as Blob

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('HEIC 转换失败'))
      reader.readAsDataURL(jpegBlob)
    })
  } catch {
    throw new Error('HEIC 转换失败')
  }
}

const handleAddImage = async (file: File) => {
  imageUploading.value = true
  try {
    const data = await fileToBase64(file)
    await keyEventStore.addImage(selectedDate.value, data, file.name)
  } catch (err) {
    message.error((err as Error)?.message || '图片上传失败')
  } finally {
    imageUploading.value = false
  }
}

const handleDeleteImage = async (imageId: string) => {
  try {
    await keyEventStore.removeImage(imageId)
  } catch { /* error handled in store */ }
}

// ========== 关联交易 ==========
const linkedTransactions = ref<TransactionRecord[]>([])
const linkedLoading = ref(false)

const loadLinkedTransactions = async (date: string) => {
  linkedLoading.value = true
  try {
    linkedTransactions.value = await getLinkedTransactions(date)
    // 同步关联交易汇总到全局统计
    let income = 0, expense = 0, transfer = 0
    for (const t of linkedTransactions.value) {
      if (t.transactionType === 'income') income += t.price
      else if (t.transactionType === 'expense') expense += t.price
      else if (t.transactionType === 'transfer') transfer += t.price
    }
    appDataStore.setStatistics({ income, expense, transfer })
  } finally {
    linkedLoading.value = false
  }
}

const handleUnlinkTr = async (transactionId: string) => {
  const ok = await unlinkTransactionFromKeyEvent(transactionId)
  if (ok) {
    linkedTransactions.value = linkedTransactions.value.filter(
      t => t.transactionId !== transactionId
    )
    // 重新计算并同步统计
    let income = 0, expense = 0, transfer = 0
    for (const t of linkedTransactions.value) {
      if (t.transactionType === 'income') income += t.price
      else if (t.transactionType === 'expense') expense += t.price
      else if (t.transactionType === 'transfer') transfer += t.price
    }
    appDataStore.setStatistics({ income, expense, transfer })
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
    const updated = await keyEventStore.fetchEventByDate(selectedDate.value)
    currentEvent.value = updated
  } catch {
    /* error handled in store */
  }
}

// ========== 初始化 ==========
onMounted(() => {
  keyEventStore.fetchDatesByYear(selectedYear.value)
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
  grid-template-columns: 280px 1fr 320px;
  gap: var(--billadm-space-md);
  min-height: 0;
  overflow: hidden;
}

.panel-left {
  height: 100%;
  overflow: hidden;
}

.panel-center {
  height: 100%;
  overflow: hidden;
}

.panel-right {
  height: 100%;
  overflow: hidden;
}

</style>
