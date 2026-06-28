<template>
  <div class="general-setting">
    <BilladmPageHeader title="通用" />

    <div class="setting-list">
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
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import BilladmPageHeader from '@/components/common/BilladmPageHeader.vue'

const devToolsEnabled = ref(false)

const onDevToolsToggle = (checked: boolean | string | number) => {
  window.electronAPI?.toggleDevTools(Boolean(checked))
}
</script>

<style scoped>
.general-setting {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.setting-list {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-xs);
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
  gap: 2px;
}

.setting-title {
  font-size: var(--billadm-size-text-body);
  font-weight: 500;
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
</style>
