<template>
  <div class="tool-row" :class="rowClass" role="button" tabindex="0" :aria-expanded="expanded" @click="toggle"
    @keydown.enter="toggle" @keydown.space.prevent="toggle">
    <span class="tool-row-indicator" :class="indicatorClass" />
    <component :is="toolIcon" class="tool-row-icon" />
    <span class="tool-row-name">{{ toolTitle }}</span>
    <span class="tool-row-summary">{{ summary }}</span>
    <span class="tool-row-arrow" :class="{ 'tool-row-arrow--open': expanded }">▾</span>
  </div>

  <!-- 展开区：参数 + 结果 -->
  <div v-if="expanded" class="tool-row-body">
    <div v-if="hasArgs" class="tool-row-section">
      <div class="tool-row-section-title">参数</div>
      <pre class="tool-row-pre">{{ argsPretty }}</pre>
    </div>
    <div v-if="msg.toolDone && msg.toolResult" class="tool-row-section">
      <div class="tool-row-section-title">结果</div>
      <div class="tool-row-result">{{ msg.toolResult }}</div>
    </div>
    <div v-if="msg.toolDone && msg.toolDetail" class="tool-row-section">
      <div class="tool-row-section-title">详情</div>
      <pre class="tool-row-pre">{{ detailPretty }}</pre>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  SearchOutlined,
  WalletOutlined,
  TagsOutlined,
  TagOutlined,
  CalendarOutlined,
  ClockCircleOutlined,
  CalculatorOutlined,
  ReadOutlined,
  EditOutlined,
} from '@ant-design/icons-vue'
import type { ChatMessage } from '@/hooks/useAiChat'

const props = defineProps<{ msg: ChatMessage; expanded: boolean }>()
const emit = defineEmits<{ toggle: [] }>()

// ---- 工具元数据：图标 / 中文名 / 摘要键（仿 DSH SUMMARY_KEYS）----

const TOOL_ICONS: Record<string, Component> = {
  query_transactions: SearchOutlined,
  list_ledgers: WalletOutlined,
  list_categories: TagsOutlined,
  list_tags: TagOutlined,
  get_key_events: CalendarOutlined,
  get_time: ClockCircleOutlined,
  calculate: CalculatorOutlined,
  query_diary: ReadOutlined,
  write_diary: EditOutlined,
}

const TOOL_TITLES: Record<string, string> = {
  query_transactions: '查询消费记录',
  list_ledgers: '账本列表',
  list_categories: '分类列表',
  list_tags: '标签列表',
  get_key_events: '关键事件',
  get_time: '获取时间',
  calculate: '计算',
  query_diary: '查询日记',
  write_diary: '写日记',
}

// 摘要键优先级：依次取参数中的关键字段生成单行摘要
const SUMMARY_KEYS: Record<string, string[]> = {
  query_transactions: ['period', 'start_date', 'end_date', 'type', 'keyword'],
  list_ledgers: [],
  list_categories: ['transaction_type'],
  list_tags: ['category'],
  get_key_events: ['year'],
  get_time: [],
  calculate: ['expression'],
  query_diary: ['date', 'keyword', 'year'],
  write_diary: ['date'],
}

// 参数值 → 友好文案
const PERIOD_LABELS: Record<string, string> = {
  today: '今天',
  this_week: '本周',
  this_month: '本月',
  last_month: '上月',
  this_year: '今年',
  last_30_days: '近30天',
}

const TYPE_LABELS: Record<string, string> = {
  income: '收入',
  expense: '支出',
  transfer: '转账',
}

const toolName = computed(() => props.msg.toolName || '')
const toolTitle = computed(() => TOOL_TITLES[toolName.value] ?? toolName.value)
const toolIcon = computed(() => TOOL_ICONS[toolName.value] ?? SearchOutlined)
const hasArgs = computed(() => {
  const a = props.msg.toolArgs
  return !!a && Object.keys(a).length > 0
})

function friendlyValue(key: string, val: unknown): string {
  if (typeof val !== 'string') return String(val ?? '')
  if (key === 'period') return PERIOD_LABELS[val] ?? val
  if (key === 'type') return TYPE_LABELS[val] ?? val
  return val
}

// 折叠态单行摘要：挑关键参数，用 " · " 连接
const summary = computed(() => {
  const args = props.msg.toolArgs || {}
  const keys = SUMMARY_KEYS[toolName.value] || []
  const parts: string[] = []
  for (const k of keys) {
    const v = args[k]
    if (v !== undefined && v !== null && v !== '') {
      parts.push(friendlyValue(k, v))
    }
  }
  if (parts.length > 0) return parts.join(' · ')
  // 无关键参数时退化为第一个字符串值
  for (const v of Object.values(args)) {
    if (typeof v === 'string' && v !== '') return v
  }
  return ''
})

const argsPretty = computed(() => JSON.stringify(props.msg.toolArgs || {}, null, 2))
const detailPretty = computed(() => {
  const d = props.msg.toolDetail
  if (d === undefined || d === null) return ''
  return typeof d === 'string' ? d : JSON.stringify(d, null, 2)
})

const rowClass = computed(() => ({
  'tool-row--running': !props.msg.toolDone,
  'tool-row--ok': props.msg.toolDone,
}))

const indicatorClass = computed(() => ({
  'tool-row-indicator--pulse': !props.msg.toolDone,
}))

function toggle() {
  emit('toggle')
}
</script>

<style scoped>
/* DSH ToolRow 风格：紧凑单行，点击展开参数与结果 */
.tool-row {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-sm);
  max-width: 90%;
  padding: var(--transactions-space-2xs) var(--transactions-space-sm);
  border-radius: var(--transactions-radius-sm);
  cursor: pointer;
  user-select: none;
  transition: background var(--transactions-transition-fast);
}

.tool-row:hover {
  background: var(--transactions-color-hover-bg);
}

.tool-row:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 2px;
}

.tool-row-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--transactions-color-accent);
  flex-shrink: 0;
}

.tool-row-indicator--pulse {
  animation: tool-row-pulse 1s ease-in-out infinite;
}

.tool-row--ok .tool-row-indicator {
  background: var(--transactions-color-success);
  animation: none;
}

@keyframes tool-row-pulse {
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

.tool-row-icon {
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-secondary);
  flex-shrink: 0;
}

.tool-row--ok .tool-row-icon {
  color: var(--transactions-color-success);
}

.tool-row-name {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-major);
  font-weight: 500;
  flex-shrink: 0;
}

.tool-row-summary {
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.tool-row-arrow {
  margin-left: auto;
  font-size: 10px;
  color: var(--transactions-color-text-secondary);
  flex-shrink: 0;
  transition: transform var(--transactions-transition-fast);
}

.tool-row-arrow--open {
  transform: rotate(180deg);
}

/* 展开区 */
.tool-row-body {
  max-width: 90%;
  margin: 0 0 var(--transactions-space-sm);
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  background: var(--transactions-color-minor-background);
  border-radius: var(--transactions-radius-md);
  animation: tool-row-body-enter 150ms ease-out both;
}

@keyframes tool-row-body-enter {
  from {
    opacity: 0;
    transform: translateY(-2px);
  }

  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tool-row-section {
  margin-bottom: var(--transactions-space-sm);
}

.tool-row-section:last-child {
  margin-bottom: 0;
}

.tool-row-section-title {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-disabled);
  margin-bottom: var(--transactions-space-2xs);
}

.tool-row-pre {
  margin: 0;
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  line-height: var(--transactions-height-normal);
  white-space: pre-wrap;
  word-break: break-word;
}

.tool-row-result {
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-major);
  line-height: var(--transactions-height-normal);
}

@media (prefers-reduced-motion: reduce) {
  .tool-row-indicator--pulse {
    animation: none;
  }

  .tool-row,
  .tool-row-arrow {
    transition: none;
  }

  .tool-row-body {
    animation: none;
  }
}
</style>
