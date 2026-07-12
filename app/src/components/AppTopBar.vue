<template>
  <div class="window-controls">
    <button class="window-btn" @click="onMinimize" aria-label="最小化" title="最小化">
      <LineOutlined />
    </button>
    <button class="window-btn" @click="onMaximize" :aria-label="isMaximized ? '还原' : '最大化'" :title="isMaximized ? '还原' : '最大化'">
      <SwitcherOutlined v-if="isMaximized" />
      <BorderOutlined v-else />
    </button>
    <button class="window-btn window-btn--close" @click="onClose" aria-label="关闭" title="关闭">
      <CloseOutlined />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { BorderOutlined, CloseOutlined, LineOutlined, SwitcherOutlined } from "@ant-design/icons-vue";

const isMaximized = ref(false)

let unsub: (() => void) | null = null

const onMinimize = () => {
  window.electronAPI.minimizeWindow();
}

const onMaximize = () => {
  window.electronAPI.maximizeWindow();
}

const onClose = () => {
  window.electronAPI.closeWindow();
}

onMounted(() => {
  unsub = window.electronAPI.onWindowStateChanged?.(({ maximized }) => {
    isMaximized.value = maximized
  }) ?? null
})

onUnmounted(() => {
  unsub?.()
})
</script>

<style scoped>
.window-controls {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 6px;
  z-index: 100;
  -webkit-app-region: no-drag;
}

.window-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(0, 0, 0, 0.04);
  border-radius: var(--billadm-radius-md);
  color: var(--billadm-color-icon);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all var(--billadm-transition-fast);
}

.window-btn:hover {
  background: var(--billadm-color-hover-bg);
  color: var(--billadm-color-text-major);
}

.window-btn--close:hover {
  background: rgba(217, 112, 90, 0.12);
  color: var(--billadm-color-expense);
}
</style>
