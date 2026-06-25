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
        :loading="imagesLoading"
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
        :loading="trsLoading"
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
import type { KeyEvent, TransactionRecord } from '@/types/billadm'
import type { UploadProgress } from './UploadProgressBar.vue'

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

const imagesLoading = ref(false)
const trsLoading = ref(false)

const clearSelection = () => {
  selectedDate.value = ''
  currentEvent.value = null
  isEditing.value = false
  keyEventStore.clearImages()
  appDataStore.setStatistics({ income: 0, expense: 0, transfer: 0 })
  uploadProgress.value = { files: [], total: 0, completed: 0, status: 'idle' }
  pendingFiles.value = []
  currentFileIndex = 0
}

const onSelectEvent = async (date: string) => {
  // 立即清空旧数据
  selectedDate.value = date
  isEditing.value = false
  currentEvent.value = null
  keyEventStore.clearImages()
  linkedTransactions.value = []
  appDataStore.setStatistics({ income: 0, expense: 0, transfer: 0 })
  imagesLoading.value = true
  trsLoading.value = false

  try {
    // 第1步：获取事件内容
    const event = await keyEventStore.fetchEventByDate(date)
    currentEvent.value = event

    // 第2步：获取图片
    if (event) {
      trsLoading.value = true
      imagesLoading.value = true
      await keyEventStore.fetchImages(date)
      imagesLoading.value = false

      // 第3步：获取关联交易
      await loadLinkedTransactions(date)
      trsLoading.value = false
    }
  } catch {
    currentEvent.value = null
    imagesLoading.value = false
    trsLoading.value = false
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
const uploadProgress = ref<UploadProgress>({
  files: [],
  total: 0,
  completed: 0,
  status: 'idle',
})

// 暂存待上传文件列表，供重试/跳过使用
const pendingFiles = ref<File[]>([])
let currentFileIndex = 0
// 批量上传时快照选中的日期，防止上传过程中日期被切换
let targetDate = ''

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
    // heic-to 使用 libheif 1.22.2，支持最新 iPhone HEIC 格式
    // 使用 /csp 路径避免 Electron 的 CSP 限制
    const { heicTo } = await import('heic-to/csp')

    const jpegBlob = await heicTo({
      blob: file,
      type: 'image/jpeg',
      quality: 0.92,
    })

    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('HEIC 转换失败'))
      reader.readAsDataURL(jpegBlob)
    })
  } catch (e) {
    throw new Error('HEIC 转换失败: ' + ((e as Error)?.message || String(e)))
  }
}

const handleAddImages = async (files: File[]) => {
  if (files.length === 0) return

  targetDate = selectedDate.value
  pendingFiles.value = files
  currentFileIndex = 0

  uploadProgress.value = {
    files: files.map(f => ({ name: f.name, percent: 0, status: 'pending' as const })),
    total: files.length,
    completed: 0,
    status: 'uploading',
  }

  await uploadCurrentFile()
}

// 上传 currentFileIndex 指向的文件
const uploadCurrentFile = async () => {
  const files = pendingFiles.value
  if (currentFileIndex >= files.length) {
    // 全部完成
    const doneCount = uploadProgress.value.files.filter(f => f.status === 'done').length
    uploadProgress.value.completed = doneCount
    uploadProgress.value.total = doneCount
    uploadProgress.value.status = 'done'
    setTimeout(() => {
      uploadProgress.value.status = 'idle'
      pendingFiles.value = []
    }, 2000)
    return
  }

  const file = files[currentFileIndex]!
  // 标记当前文件为上传中
  uploadProgress.value.files[currentFileIndex] = {
    name: file.name,
    percent: 0,
    status: 'uploading',
  }

  try {
    const data = await fileToBase64(file)
    await keyEventStore.addImage(
      targetDate,
      data,
      file.name,
      (percent: number) => {
        const entry = uploadProgress.value.files[currentFileIndex]
        if (entry) {
          entry.percent = percent
        }
      }
    )
    // 标记完成
    uploadProgress.value.files[currentFileIndex] = {
      name: file.name,
      percent: 100,
      status: 'done',
    }
    uploadProgress.value.completed++
    currentFileIndex++
    await uploadCurrentFile()
  } catch (err) {
    uploadProgress.value.files[currentFileIndex] = {
      name: file.name,
      percent: 0,
      status: 'error',
      errorMessage: (err as Error)?.message || '图片上传失败',
    }
    uploadProgress.value.status = 'error'
    uploadProgress.value.errorMessage =
      (err as Error)?.message || '图片上传失败'
  }
}

const handleRetryUpload = async () => {
  // 将当前失败文件重置为 pending，继续上传
  uploadProgress.value.files[currentFileIndex] = {
    name: pendingFiles.value[currentFileIndex]!.name,
    percent: 0,
    status: 'pending',
  }
  uploadProgress.value.status = 'uploading'
  await uploadCurrentFile()
}

const handleSkipUpload = async () => {
  // 跳过当前文件（保持 error 状态），继续下一个
  currentFileIndex++
  uploadProgress.value.status = 'uploading'
  await uploadCurrentFile()
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
    linkedTransactions.value = await getLinkedTransactions(date)
    // 同步关联交易汇总到全局统计
    let income = 0, expense = 0, transfer = 0
    for (const t of linkedTransactions.value) {
      if (t.transactionType === 'income') income += t.price
      else if (t.transactionType === 'expense') expense += t.price
      else if (t.transactionType === 'transfer') transfer += t.price
    }
    appDataStore.setStatistics({ income, expense, transfer })
  } catch {
    linkedTransactions.value = []
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
