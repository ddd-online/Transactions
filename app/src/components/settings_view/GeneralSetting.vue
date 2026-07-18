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

      <!-- DevTools 开关 -->
      <div class="setting-card">
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
    <billadm-file-select
      v-model="showFileSelect"
      title="选择工作目录"
      placeholder="请输入或选择工作目录路径"
      @confirm="handleSwitchWorkspace"
    />

  </SettingsPageWrapper>
</template>
<script lang="ts" setup>
import { ref, onMounted } from 'vue'
import { useLedgerStore } from '@/stores/ledgerStore'
import NotificationUtil from '@/backend/notification'

const ledgerStore = useLedgerStore()

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
const devToolsEnabled = ref(false)

const onDevToolsToggle = (checked: boolean | string | number) => {
  window.electronAPI?.toggleDevTools(Boolean(checked))
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

.setting-title {
  font-size: var(--billadm-size-text-body);
  font-weight: var(--billadm-weight-medium);
  color: var(--billadm-color-text-major);
}

.setting-desc {
  font-size: var(--billadm-size-text-caption);
  font-family: var(--billadm-font-mono);
  color: var(--billadm-color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.setting-desc.empty {
  color: var(--billadm-color-text-disabled);
  font-style: italic;
  font-family: var(--billadm-font-body);
}

.setting-action {
  flex-shrink: 0;
  margin-left: var(--billadm-space-lg);
}

@media (prefers-reduced-motion: reduce) {
  .setting-card { transition: none; }
}
</style>
