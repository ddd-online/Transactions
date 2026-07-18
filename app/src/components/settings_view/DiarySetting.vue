<template>
  <SettingsPageWrapper title="日记配置">

    <div class="setting-list">
      <!-- 导入日记 -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-card-title">导入日记</span>
          <span class="setting-desc">从本地目录批量导入，文件名需为 YYYY-MM-DD.txt 格式</span>
          <!-- 浏览器 dev 模式降级 -->
          <div v-if="!isElectron" class="dev-path-row">
            <a-input
              v-model:value="manualPath"
              placeholder="例如 C:\Users\me\diaries 或 /home/me/diaries"
              size="small"
              class="dev-path-input"
            />
          </div>
        </div>
        <div class="setting-action">
          <a-tooltip
            title="从本地目录批量导入日记，文件名需为 YYYY-MM-DD.txt 格式"
            :mouse-enter-delay="0.5"
          >
            <a-button
              type="default"
              :disabled="!isElectron && !manualPath"
              @click="handleImportClick"
            >
              <template #icon><FolderOpenOutlined /></template>
              选择目录导入
            </a-button>
          </a-tooltip>
        </div>
      </div>
    </div>

    <!-- 进度条（导入中/完成/错误） -->
    <div v-if="importState.status !== 'idle'" class="import-progress-card">
      <div class="progress-summary">
        <div class="summary-row">
          <span class="summary-text">
            <LoadingOutlined v-if="importState.status === 'scanning'" spin />
            <template v-if="importState.status === 'scanning'">
              正在扫描目录…
            </template>
            <template v-else-if="importState.status === 'importing'">
              导入中 {{ importState.completed }}/{{ importState.total }}
            </template>
            <template v-else-if="importState.status === 'done'">
              <CheckCircleOutlined class="status-icon done" />
              {{ importState.total }} 篇导入完成
            </template>
            <template v-else-if="importState.status === 'error'">
              <CloseCircleOutlined class="status-icon error" />
              导入中断，已完成 {{ importState.completed }}/{{ importState.total }}
            </template>
          </span>
          <span class="summary-percent">{{ percent }}%</span>
        </div>
        <div class="summary-bar-track">
          <div
            class="summary-bar-fill"
            :class="barClass"
            :style="{ transform: `scaleX(${percent / 100})` }"
          />
        </div>
      </div>

      <!-- 文件列表 -->
      <div class="file-list" v-if="importState.files.length > 0">
        <div
          v-for="(f, i) in importState.files"
          :key="i"
          class="file-row"
          :class="'file-row--' + f.status"
          :title="f.errorMessage || undefined"
        >
          <span class="file-dot">
            <CheckCircleFilled v-if="f.status === 'done'" class="dot-icon done" />
            <LoadingOutlined v-else-if="f.status === 'importing'" class="dot-icon importing" spin />
            <CloseCircleFilled v-else-if="f.status === 'error'" class="dot-icon error" />
            <span v-else class="dot-dot" />
          </span>
          <span class="file-date">{{ f.date }}</span>
          <span class="file-status-text" :class="'status--' + f.status">
            <template v-if="f.status === 'pending'">等待中</template>
            <template v-else-if="f.status === 'importing'">导入中</template>
            <template v-else-if="f.status === 'done'">已完成</template>
            <template v-else-if="f.status === 'error'">{{ f.errorMessage || '失败' }}</template>
          </span>
        </div>
      </div>
    </div>
  </SettingsPageWrapper>
</template>

<script setup lang="ts">
import { reactive, computed, ref, onUnmounted } from 'vue'
import { FolderOpenOutlined, CheckCircleOutlined, CheckCircleFilled, CloseCircleOutlined, CloseCircleFilled, LoadingOutlined } from '@ant-design/icons-vue'
import { message } from 'ant-design-vue'
import { scanDirectory, importFile } from '@/backend/api/diary'
import { useDiaryStore } from '@/stores/diaryStore'

// ---- Electron 检测 ----
const isElectron = computed(() => !!window.electronAPI)

// ---- 手动路径（浏览器 dev 降级） ----
const manualPath = ref('')

// ---- 进度状态 ----

interface ImportFileItem {
  date: string
  status: 'pending' | 'importing' | 'done' | 'error'
  errorMessage?: string
}

interface ImportState {
  status: 'idle' | 'scanning' | 'importing' | 'done' | 'error'
  files: ImportFileItem[]
  total: number
  completed: number
}

const importState = reactive<ImportState>({
  status: 'idle',
  files: [],
  total: 0,
  completed: 0,
})
let resetTimer: ReturnType<typeof setTimeout> | null = null
onUnmounted(() => { if (resetTimer) clearTimeout(resetTimer) })

const percent = computed(() => {
  if (importState.total === 0) return 0
  return Math.round((importState.completed / importState.total) * 100)
})

const barClass = computed(() => ({
  'summary-bar-fill--done': importState.status === 'done',
  'summary-bar-fill--error': importState.status === 'error',
}))

// ---- 导入流程 ----

const diaryStore = useDiaryStore()

async function handleImportClick() {
  let directory: string

  if (isElectron.value) {
    const result = await window.electronAPI.openDialog({
      properties: ['openDirectory'],
    })
    if (result.canceled || !result.filePaths?.length) return
    directory = result.filePaths[0]
  } else {
    if (!manualPath.value.trim()) return
    directory = manualPath.value.trim()
  }

  await doImport(directory)
}

async function doImport(directory: string) {
  // ---- 1. 扫描 ----
  importState.status = 'scanning'
  importState.files = []
  importState.total = 0
  importState.completed = 0

  let fileList: { date: string; path: string }[]
  try {
    const res = await scanDirectory(directory)
    fileList = res.files || []
  } catch (e: any) {
    message.error('扫描目录失败: ' + (e?.message || e))
    importState.status = 'idle'
    return
  }

  if (fileList.length === 0) {
    message.info('未找到符合格式的日记文件（YYYY-MM-DD.txt）')
    importState.status = 'idle'
    return
  }

  importState.files = fileList.map(f => ({
    date: f.date,
    status: 'pending' as const,
  }))
  importState.total = fileList.length

  // ---- 2. 逐文件导入 ----
  importState.status = 'importing'
  let hasError = false

  for (let i = 0; i < fileList.length; i++) {
    const item = fileList[i]!
    importState.files[i]!.status = 'importing'

    try {
      await importFile(item.path, item.date)
      importState.files[i]!.status = 'done'
      importState.completed++
    } catch (e: any) {
      importState.files[i]!.status = 'error'
      importState.files[i]!.errorMessage = e?.message || '未知错误'
      hasError = true
    }
  }

  // ---- 3. 完成 ----
  importState.status = hasError ? 'error' : 'done'

  // 刷新日记日期列表
  await diaryStore.loadDates()

  if (importState.status === 'done') {
    message.success(`成功导入 ${importState.completed} 篇日记`)
    // 1.5s 后自动恢复按钮
    resetTimer = setTimeout(() => {
      importState.status = 'idle'
      importState.files = []
      importState.total = 0
      importState.completed = 0
    }, 1500)
  }
}
</script>

<style scoped>
.setting-list {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-sm);
}

.setting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--billadm-space-md) var(--billadm-space-lg);
  background-color: var(--billadm-color-major-background);
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-md);
  transition: background-color var(--billadm-transition-fast);
}

.setting-card:hover {
  background-color: var(--billadm-color-hover-bg);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-2xs);
  min-width: 0;
}

.setting-card-title {
  font-size: var(--billadm-size-text-body);
  font-weight: var(--billadm-weight-medium);
  color: var(--billadm-color-text-major);
}

.setting-desc {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
}

.setting-action {
  flex-shrink: 0;
  margin-left: var(--billadm-space-lg);
}

.dev-path-row {
  margin-top: var(--billadm-space-xs);
}

.dev-path-input {
  width: 260px;
}

/* ---- 进度卡片 ---- */
.import-progress-card {
  margin-top: var(--billadm-space-md);
  background: var(--billadm-color-major-background);
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-md);
  padding: var(--billadm-space-md);
}

/* 总进度 */
.progress-summary {
  margin-bottom: var(--billadm-space-sm);
}

.summary-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--billadm-space-sm);
}

.summary-text {
  display: inline-flex;
  align-items: center;
  gap: var(--billadm-space-xs);
  font-size: var(--billadm-size-text-body-sm);
  font-weight: var(--billadm-weight-medium);
  color: var(--billadm-color-text-major);
}

.status-icon.done { color: var(--billadm-color-success); }
.status-icon.error { color: var(--billadm-color-expense); }

.summary-percent {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.summary-bar-track {
  width: 100%;
  height: 4px;
  border-radius: var(--billadm-space-2xs);
  background: var(--billadm-color-minor-background);
  overflow: hidden;
}

.summary-bar-fill {
  height: 100%;
  border-radius: var(--billadm-space-2xs);
  background: var(--billadm-color-primary);
  transform-origin: left;
  transition: transform 200ms ease;
}

.summary-bar-fill--done { background: var(--billadm-color-success); }
.summary-bar-fill--error { background: var(--billadm-color-expense); }

/* 文件列表 */
.file-list {
  display: flex;
  flex-direction: column;
  gap: 0;
  max-height: 280px;
  overflow-y: auto;
}

.file-row {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  padding: var(--billadm-space-xs) var(--billadm-space-xs);
  border-radius: var(--billadm-radius-sm);
  font-size: var(--billadm-size-text-body-sm);
}

.file-row:hover {
  background: var(--billadm-color-hover-bg);
}

.file-row--importing {
  background: var(--billadm-color-hover-bg);
}

.file-row--error {
  background: var(--billadm-color-danger-hover-bg);
}

.file-dot {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.dot-icon {
  font-size: var(--billadm-size-text-body);
}
.dot-icon.done { color: var(--billadm-color-success); }
.dot-icon.importing { color: var(--billadm-color-primary); }
.dot-icon.error { color: var(--billadm-color-expense); }

.dot-dot {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--billadm-color-text-disabled);
}

.file-date {
  flex: 1;
  font-variant-numeric: tabular-nums;
  color: var(--billadm-color-text-major);
}

.file-status-text {
  flex-shrink: 0;
  font-size: var(--billadm-size-text-caption);
}

.status--pending,
.status--importing { color: var(--billadm-color-text-disabled); }
.status--done { color: var(--billadm-color-success); }
.status--error { color: var(--billadm-color-expense); }

@media (prefers-reduced-motion: reduce) {
  .summary-bar-fill { transition: none; }
}
</style>
