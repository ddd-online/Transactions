<template>
  <div class="msg-tool" :class="{ 'msg-tool--done': msg.toolDone }">
    <div class="msg-tool-header">
      <span class="msg-tool-indicator" :class="{ 'msg-tool-indicator--pulse': !msg.toolDone }"></span>
      <span class="msg-tool-name">{{ msg.toolName }}</span>
    </div>
    <div v-if="msg.toolArgs && Object.keys(msg.toolArgs).length > 0" class="msg-tool-args">
      <div v-for="(val, key) in msg.toolArgs" :key="key" class="msg-tool-arg">
        <span class="msg-tool-arg-key">{{ key }}</span>
        <span class="msg-tool-arg-val">{{ formatArgValue(val) }}</span>
      </div>
    </div>
    <div v-if="msg.toolDone && msg.toolResult" class="msg-tool-summary">{{ msg.toolResult }}</div>
    <div v-if="msg.toolDone && msg.toolDetail" class="msg-tool-detail">
      <a-button type="link" size="small" @click="emit('toggle')" class="msg-tool-detail-toggle">
        {{ expanded ? '收起详情' : '查看详情' }}
      </a-button>
      <pre v-if="expanded" class="msg-tool-detail-json">{{ JSON.stringify(msg.toolDetail, null, 2) }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ChatMessage } from '@/hooks/useAiChat'

defineProps<{ msg: ChatMessage; expanded: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

function formatArgValue(val: unknown): string {
  if (typeof val === 'string') return val
  if (typeof val === 'number') return String(val)
  if (typeof val === 'boolean') return val ? '是' : '否'
  if (val === null || val === undefined) return '—'
  return JSON.stringify(val)
}
</script>

<style scoped>
/* Tool Card — 进行中琥珀语义，完成后翻转成功绿 */
.msg-tool {
  max-width: 90%;
  background: var(--billadm-color-outlier-tint);
  border: 1px solid var(--billadm-color-outlier-tint-strong);
  border-radius: var(--billadm-radius-md);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  margin-bottom: var(--billadm-space-xs);
  transition: background var(--billadm-transition-normal), border-color var(--billadm-transition-normal);
}

.msg-tool--done {
  background: var(--billadm-color-income-tint);
  border-color: var(--billadm-color-success);
}

.msg-tool-header {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-secondary);
}

.msg-tool-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--billadm-color-accent);
  flex-shrink: 0;
  animation: msg-tool-dot-pop 300ms ease-out both;
}

.msg-tool-indicator--pulse {
  animation: pulse-scale 1s ease-in-out infinite;
}

@keyframes pulse-scale {
  0% {
    transform: scale(1);
    opacity: 1;
  }

  50% {
    transform: scale(1.3);
    opacity: 0.6;
  }

  100% {
    transform: scale(1);
    opacity: 1;
  }
}

@keyframes msg-tool-dot-pop {
  0% {
    transform: scale(0);
  }

  60% {
    transform: scale(1.4);
  }

  100% {
    transform: scale(1);
  }
}

.msg-tool--done .msg-tool-indicator {
  background: var(--billadm-color-success);
  animation: none;
}

.msg-tool-name {
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-major);
  font-weight: 500;
}

.msg-tool-args {
  margin-top: var(--billadm-space-xs);
  display: flex;
  flex-wrap: wrap;
  gap: var(--billadm-space-xs);
}

.msg-tool-arg {
  display: inline-flex;
  align-items: center;
  gap: var(--billadm-space-2xs);
  background: var(--billadm-color-minor-background);
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-sm);
  padding: 1px 6px;
  font-size: var(--billadm-size-text-caption);
  line-height: 1.6;
}

.msg-tool-arg-key {
  color: var(--billadm-color-text-secondary);
  font-family: var(--billadm-font-body);
}

.msg-tool-arg-key::after {
  content: ':';
}

.msg-tool-arg-val {
  color: var(--billadm-color-text-major);
  font-family: var(--billadm-font-mono);
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg-tool-summary {
  margin-top: var(--billadm-space-sm);
  font-family: var(--billadm-font-body);
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
  line-height: var(--billadm-height-normal);
}

.msg-tool-detail {
  margin-top: var(--billadm-space-sm);
}

.msg-tool-detail-toggle {
  font-size: var(--billadm-size-text-caption);
  padding: 0;
  height: auto;
  color: var(--billadm-color-primary);
}

.msg-tool-detail-json {
  margin-top: var(--billadm-space-sm);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  background: var(--billadm-color-minor-background);
  border-radius: var(--billadm-radius-sm);
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  line-height: var(--billadm-height-normal);
  overflow-x: auto;
  white-space: pre;
}

@media (prefers-reduced-motion: reduce) {
  .msg-tool-indicator,
  .msg-tool-indicator--pulse {
    animation: none;
  }

  .msg-tool {
    transition: none;
  }
}
</style>
