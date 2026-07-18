<template>
  <BilladmPageLayout>
    <template #toolbar>
      <div class="diary-toolbar">
        <div class="toolbar-left">
          <a-button size="small" @click="goToToday">今天</a-button>
          <a-button size="small" @click="collapseAll">收起全部</a-button>
          <a-date-picker v-model:value="jumpDate" size="small" placeholder="跳转到日期" format="YYYY-MM-DD"
            value-format="YYYY-MM-DD" :allow-clear="false" @change="onJumpToDate" />
        </div>
      </div>
    </template>

    <!-- 两栏主体 -->
    <div class="diary-body">
      <DiaryTree ref="treeRef" class="panel-left" :dates="store.dates" :selected-date="selectedDate"
        @select="onSelectDate" />
      <DiaryEditor class="panel-right" :entry="store.currentEntry" :save-status="store.saveStatus" @save="onSave"
        @delete="onDelete" />
    </div>
  </BilladmPageLayout>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import dayjs, { type Dayjs } from 'dayjs'
import { useDiaryStore } from '@/stores/diaryStore'
const store = useDiaryStore()

const selectedDate = ref('')
const jumpDate = ref<Dayjs>()
const treeRef = ref()

// ---- 初始化 ----
onMounted(async () => {
  const today = dayjs().format('YYYY-MM-DD')
  selectedDate.value = today
  await Promise.all([store.loadDates(), store.loadEntry(today)])
})

// ---- 日期导航 ----
const goToDate = (date: string) => {
  selectedDate.value = date
  store.loadEntry(date)
}

const goToToday = () => {
  jumpDate.value = undefined
  goToDate(dayjs().format('YYYY-MM-DD'))
  treeRef.value?.goToToday()
}

const collapseAll = () => {
  treeRef.value?.collapseAll()
}

const onJumpToDate = (_value: string | Dayjs, dateString: string) => {
  if (dateString) goToDate(dateString)
}

// ---- 事件处理 ----
const onSelectDate = (date: string) => goToDate(date)

const onSave = (data: { date: string; content: string; mood: string }) => {
  store.saveEntry(data.date, data.content, data.mood)
}

const onDelete = async (date: string) => {
  await store.removeEntry(date)
  selectedDate.value = ''
}
</script>

<style scoped>
.diary-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-md);
}

.diary-body {
  flex: 1;
  display: grid;
  grid-template-columns: 260px 1fr;
  gap: var(--billadm-space-md);
  min-height: 0;
  overflow: hidden;
}

.panel-left {
  height: 100%;
  overflow: hidden;
  border-right: 1px solid var(--billadm-color-divider);
  padding-right: var(--billadm-space-sm);
}

.panel-right {
  height: 100%;
  overflow: hidden;
}
</style>
