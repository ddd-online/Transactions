<template>
  <div class="window-controls">
    <div
      class="kernel-status"
      :class="`kernel-status--${kernelState}`"
      :title="statusTooltip"
      role="status"
      aria-label="内核状态指示灯"
    >
      <span class="status-dot" />
    </div>
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
import { computed, ref, onMounted, onUnmounted } from 'vue'
import { BorderOutlined, CloseOutlined, LineOutlined, SwitcherOutlined } from "@ant-design/icons-vue";

const isMaximized = ref(false)

let unsub: (() => void) | null = null
let unsubKernel: (() => void) | null = null

type KernelState = 'unknown' | 'starting' | 'ok' | 'down' | 'stopped'

const kernelState = ref<KernelState>('unknown')
const kernelDetail = ref('')

const statusTooltip = computed(() => {
  const prefix = '内核状态指示灯'
  switch (kernelState.value) {
    case 'ok':
      return `${prefix}：后台服务正常`
    case 'starting':
      return `${prefix}：后台服务启动中…`
    case 'down':
      return kernelDetail.value ? `${prefix}：后台服务异常（${kernelDetail.value}）` : `${prefix}：后台服务异常`
    case 'stopped':
      return `${prefix}：后台服务已停止`
    default:
      return `${prefix}：状态未知`
  }
})

const applyKernelStatus = (data: { state?: string; detail?: string }) => {
  kernelState.value = (data.state as KernelState) || 'unknown'
  kernelDetail.value = data.detail || ''
}

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
  // 先取一次当前状态，避免错过启动阶段的状态推送
  window.electronAPI?.getKernelStatus?.().then(applyKernelStatus).catch(() => { })
  unsubKernel = window.electronAPI?.onKernelStatusChanged?.(applyKernelStatus) ?? null
  unsub = window.electronAPI?.onWindowStateChanged?.(({ maximized }) => {
    isMaximized.value = maximized
  }) ?? null
})

onUnmounted(() => {
  unsub?.()
  unsubKernel?.()
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

/* 内核状态指示灯：正常绿、异常红 */
.kernel-status {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 32px;
  border-radius: var(--billadm-radius-md);
  cursor: default;
  transition: background var(--billadm-transition-fast);
}

.kernel-status:hover {
  background: var(--billadm-color-hover-bg);
}

.status-dot {
  width: 10px;
  height: 10px;
  border-radius: var(--billadm-radius-full);
  background: var(--billadm-color-divider);
  transition: background var(--billadm-transition-fast), box-shadow var(--billadm-transition-fast);
}

.kernel-status--ok .status-dot {
  background: var(--billadm-color-success);
  box-shadow: 0 0 5px rgba(61, 140, 94, 0.4);
}

.kernel-status:not(.kernel-status--ok) .status-dot {
  background: var(--billadm-color-negative);
  box-shadow: 0 0 5px rgba(217, 112, 90, 0.4);
}
</style>
