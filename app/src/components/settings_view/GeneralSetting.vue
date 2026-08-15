<template>
  <SettingsPageWrapper title="通用设置">

    <div class="setting-list">
      <!-- 工作空间 -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">工作空间</span>
          <span class="setting-desc" :class="{ empty: !workspaceDir }">
            {{ workspaceDir || '未设置工作空间' }}
          </span>
        </div>
        <div class="setting-action">
          <a-button @click="showFileSelect = true">切换</a-button>
        </div>
      </div>

      <!-- 外观 -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">外观</span>
          <span class="setting-desc">界面颜色方案，可跟随系统</span>
        </div>
        <div class="setting-action">
          <a-segmented
            v-model:value="appearance"
            :options="appearanceOptions"
            @change="onAppearanceChange"
          />
        </div>
      </div>

      <!-- 关闭行为 -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">关闭行为</span>
          <span class="setting-desc">点击关闭按钮时的操作</span>
        </div>
        <div class="setting-action">
          <a-segmented
            v-model:value="closeBehavior"
            :options="closeBehaviorOptions"
            @change="onCloseBehaviorChange"
          />
        </div>
      </div>

      <!-- DevTools 开关（仅开发模式显示，生产环境禁开） -->
      <div v-if="isDev" class="setting-card">
        <div class="setting-info">
          <span class="setting-title">开发者工具</span>
          <span class="setting-desc">打开 Chromium DevTools，用于调试前端代码</span>
        </div>
        <div class="setting-action">
          <a-switch
            v-model:checked="devToolsEnabled"
            @change="onDevToolsToggle"
          />
        </div>
      </div>
    </div>

    <!-- 工作空间选择弹窗 -->
    <transactions-file-select
      v-model="showFileSelect"
      title="选择工作目录"
      placeholder="请输入或选择工作目录路径"
      @confirm="handleSwitchWorkspace"
    />

  </SettingsPageWrapper>
</template>
<script lang="ts" setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { storeToRefs } from 'pinia'
import { useLedgerStore } from '@/stores/ledgerStore'
import { useAppearanceStore } from '@/stores/appearanceStore'
import NotificationUtil from '@/backend/notification'

const ledgerStore = useLedgerStore()

// ---- 外观 ----
const appearanceStore = useAppearanceStore()
const { appearance } = storeToRefs(appearanceStore)

const appearanceOptions = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' },
  { value: 'system', label: '跟随系统' },
]

const onAppearanceChange = (value: string | number) => {
  const mode = String(value)
  if (mode === 'light' || mode === 'dark' || mode === 'system') {
    appearanceStore.setAppearance(mode)
  }
}

// ---- 工作空间 ----
const showFileSelect = ref(false)
const workspaceDir = ref('')

onMounted(async () => {
  workspaceDir.value = await window.electronAPI?.getWorkspace() || ''
})

const handleSwitchWorkspace = async (newWorkspaceDir: string) => {
  try {
    await ledgerStore.switchWorkspace(newWorkspaceDir)
    workspaceDir.value = newWorkspaceDir
    NotificationUtil.success('切换工作空间成功')
  } catch {
    // 错误已在 store 中通知
  }
}

// ---- DevTools ----
// 开关始终同步主进程的真实开合状态（含启动时自动打开、DevTools 自身按钮关闭等场景），
// 避免开关显示与实际状态脱节导致"拨了没反应"。
const isDev = ref(false)
const devToolsEnabled = ref(false)
let unsubscribeDevToolsState: (() => void) | null = null

onMounted(async () => {
  const isDevInfo = await window.electronAPI?.getAppInfo('isDev')
  isDev.value = isDevInfo === 'true'
  devToolsEnabled.value = Boolean(await window.electronAPI?.getDevToolsState())
  unsubscribeDevToolsState = window.electronAPI?.onDevToolsStateChanged((opened) => {
    devToolsEnabled.value = opened
  }) ?? null
})

onBeforeUnmount(() => {
  unsubscribeDevToolsState?.()
})

const onDevToolsToggle = async (checked: boolean | string | number) => {
  const state = await window.electronAPI?.toggleDevTools(Boolean(checked))
  if (typeof state === 'boolean') devToolsEnabled.value = state
}

// ---- 关闭行为 ----
const closeBehavior = ref('')

onMounted(async () => {
  closeBehavior.value = await window.electronAPI?.getCloseBehavior() || ''
})

const closeBehaviorOptions = [
  { value: 'quit', label: '直接关闭' },
  { value: 'tray', label: '缩小到托盘' },
]

const onCloseBehaviorChange = (value: string | number) => {
  window.electronAPI?.setCloseBehavior(String(value))
}
</script>

<style scoped>
.setting-list {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-sm);
}

.setting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--transactions-space-md) var(--transactions-space-lg);
  background-color: var(--transactions-color-major-background);
  border: 1px solid var(--transactions-color-divider);
  border-radius: var(--transactions-radius-md);
  transition: background-color var(--transactions-transition-fast);
}

.setting-card:hover {
  background-color: var(--transactions-color-hover-bg);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-2xs);
  min-width: 0;
}

.setting-title {
  font-size: var(--transactions-size-text-body);
  font-weight: var(--transactions-weight-medium);
  color: var(--transactions-color-text-major);
}

.setting-desc {
  font-size: var(--transactions-size-text-caption);
  font-family: var(--transactions-font-mono);
  color: var(--transactions-color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setting-desc.empty {
  color: var(--transactions-color-text-disabled);
  font-style: italic;
  font-family: var(--transactions-font-body);
}

.setting-action {
  flex-shrink: 0;
  margin-left: var(--transactions-space-lg);
}

@media (prefers-reduced-motion: reduce) {
  .setting-card { transition: none; }
}
</style>
