<template>
  <div class="diary-editor">
    <!-- 空状态 — 未选择日期 -->
    <div v-if="!entry" class="editor-empty">
      <div class="empty-inner">
        <span class="empty-icon">📖</span>
        <span class="empty-text">选择左侧日期开始写作</span>
        <span class="empty-hint">或点击工具栏「今天」开始今天的日记</span>
      </div>
    </div>

    <!-- 编辑器 -->
    <template v-else>
      <!-- 头部：日期 + 心情 + 字数 -->
      <div class="editor-header">
        <div class="editor-date-group">
          <span class="date-text">{{ formattedDate }}</span>
          <span class="date-weekday">{{ weekday }}</span>
        </div>
        <div class="editor-meta">
          <!-- 心情选择器 -->
          <div class="mood-picker" role="radiogroup" aria-label="心情">
            <button
              v-for="m in moods"
              :key="m.emoji || 'none'"
              class="mood-btn"
              :class="{ active: localMood === m.emoji, 'is-none': m.emoji === '' }"
              :aria-label="m.label"
              :aria-pressed="localMood === m.emoji"
              :title="m.label"
              @click="onMoodChange(m.emoji)"
            >
              {{ m.emoji || '—' }}
            </button>
          </div>
          <span class="word-count" aria-live="polite">{{ wordCount }}字</span>
        </div>
      </div>

      <!-- 编辑/预览区 -->
      <div class="editor-body">
        <div v-if="mode === 'edit'" class="editor-textarea-wrap">
          <textarea
            ref="textareaRef"
            class="editor-textarea"
            :value="localContent"
            placeholder="写下今天的日记…"
            @input="onInput"
            @keydown="onKeydown"
          />
        </div>
        <div
          v-if="mode === 'preview'"
          class="editor-preview"
          v-html="renderedHtml"
        />
      </div>

      <!-- 底部：模式切换 + 操作 + 保存状态 -->
      <div class="editor-footer">
        <div class="footer-left">
          <a-button
            type="text"
            size="small"
            @click="mode = mode === 'edit' ? 'preview' : 'edit'"
          >
            <template #icon>
              <EyeOutlined v-if="mode === 'edit'" />
              <EditOutlined v-else />
            </template>
            {{ mode === 'edit' ? '预览' : '编辑' }}
          </a-button>
          <span class="footer-hint">Ctrl+S 保存</span>
        </div>
        <div class="footer-right">
          <span v-if="saveStatus === 'saving'" class="save-status is-saving">保存中…</span>
          <span v-else-if="saveStatus === 'saved'" class="save-status is-saved">已保存</span>
          <span v-else-if="saveStatus === 'error'" class="save-status is-error">保存失败</span>
          <a-button
            type="text"
            size="small"
            danger
            @click="onDeleteClick"
          >
            <template #icon><DeleteOutlined /></template>
            删除
          </a-button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onUnmounted } from 'vue'
import dayjs from 'dayjs'
import { EyeOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons-vue'
import { Modal } from 'ant-design-vue'
import { renderMarkdown } from '@/utils/markdown'
import type { DiaryEntry } from '@/types/billadm'

const props = defineProps<{
  entry: DiaryEntry | null
  saveStatus: 'idle' | 'saving' | 'saved' | 'error'
}>()

const emit = defineEmits<{
  save: [data: { date: string; content: string; mood: string }]
  delete: [date: string]
}>()

// ---- 心情选项 ----
const moods = [
  { emoji: '',  label: '无' },
  { emoji: '😊', label: '开心' },
  { emoji: '😐', label: '平静' },
  { emoji: '😢', label: '难过' },
  { emoji: '😤', label: '生气' },
  { emoji: '😰', label: '焦虑' },
]

// ---- 本地状态 ----
const mode = ref<'edit' | 'preview'>('preview')
const localContent = ref('')
const localMood = ref('')

// ---- 自动保存 ----
let saveTimer: ReturnType<typeof setTimeout> | null = null
onUnmounted(() => { if (saveTimer) clearTimeout(saveTimer) })

// 同步外部 entry 到本地编辑状态
watch(() => props.entry, (newEntry) => {
  if (saveTimer) clearTimeout(saveTimer)
  if (newEntry) {
    localContent.value = newEntry.content
    localMood.value = newEntry.mood
    mode.value = 'preview'
  } else {
    localContent.value = ''
    localMood.value = ''
    mode.value = 'preview'
  }
}, { immediate: true })

// 输入 → 防抖保存
const onInput = (e: Event) => {
  const target = e.target as HTMLTextAreaElement
  localContent.value = target.value
  scheduleSave()
}

const onMoodChange = (emoji: string) => {
  localMood.value = emoji
  scheduleSave()
}

const scheduleSave = () => {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => doSave(), 1500)
}

const doSave = () => {
  if (!props.entry) return
  emit('save', {
    date: props.entry.date,
    content: localContent.value,
    mood: localMood.value,
  })
}

// Ctrl+S 手动触发
const onKeydown = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    if (saveTimer) clearTimeout(saveTimer)
    doSave()
  }
}

// ---- 删除 ----
const onDeleteClick = () => {
  if (!props.entry) return
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除 ${props.entry.date} 的日记吗？此操作不可撤销。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: () => emit('delete', props.entry!.date),
  })
}

// ---- 派生值 ----
const dateDayjs = computed(() => props.entry?.date ? dayjs(props.entry.date) : null)
const formattedDate = computed(() => dateDayjs.value?.format('YYYY年M月D日') ?? '')
const weekday = computed(() => dateDayjs.value?.format('dddd') ?? '')

const wordCount = computed(() => [...localContent.value].length)

const renderedHtml = computed(() => renderMarkdown(localContent.value))
</script>

<style scoped>
.diary-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* ---- 空状态 ---- */
.editor-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

.empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--billadm-space-xs);
}

.empty-icon {
  font-size: 32px;
  opacity: 0.4;
  margin-bottom: var(--billadm-space-xs);
}

.empty-text {
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-secondary);
}

.empty-hint {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
}

/* ---- 头部 ---- */
.editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: var(--billadm-space-lg);
  border-bottom: 1px solid var(--billadm-color-divider);
  flex-shrink: 0;
}

.editor-date-group {
  display: flex;
  align-items: baseline;
  gap: var(--billadm-space-sm);
  min-width: 0;
}

.date-text {
  font-family: var(--billadm-font-display);
  font-size: var(--billadm-size-text-display-sm);
  font-weight: var(--billadm-weight-semibold);
  color: var(--billadm-color-text-major);
  line-height: var(--billadm-height-tight);
  white-space: nowrap;
}

.date-weekday {
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-secondary);
  white-space: nowrap;
}

.editor-meta {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-md);
  flex-shrink: 0;
}

/* ---- 心情选择器 ---- */
.mood-picker {
  display: flex;
  gap: 0;
  background: var(--billadm-color-minor-background);
  border-radius: var(--billadm-radius-md);
  padding: var(--billadm-space-2xs);
}

.mood-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: none;
  border-radius: var(--billadm-radius-sm);
  cursor: pointer;
  font-size: var(--billadm-size-text-body);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform var(--billadm-transition-fast),
              opacity var(--billadm-transition-fast),
              background var(--billadm-transition-fast);
  opacity: 0.35;
  line-height: 1;
}

.mood-btn:hover {
  opacity: 0.65;
  background: var(--billadm-color-hover-bg);
}

.mood-btn.active {
  opacity: 1;
  background: var(--billadm-color-active-bg);
  transform: scale(1.1);
}

.mood-btn.is-none {
  font-size: 11px;
  font-weight: var(--billadm-weight-semibold);
  color: var(--billadm-color-text-disabled);
  opacity: 0.5;
}

.mood-btn:focus-visible {
  outline: 2px solid var(--billadm-color-primary);
  outline-offset: -1px;
}

/* ---- 字数 ---- */
.word-count {
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ---- 编辑主体 ---- */
.editor-body {
  flex: 1;
  overflow: hidden;
  padding: var(--billadm-space-md) 0;
}

.editor-textarea-wrap {
  height: 100%;
}

.editor-textarea {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  resize: none;
  background: none;
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
  line-height: var(--billadm-height-relaxed);
  padding: var(--billadm-space-md);
  tab-size: 4;
}

.editor-textarea::placeholder {
  color: var(--billadm-color-text-disabled);
  font-style: italic;
  font-family: var(--billadm-font-body);
}

.editor-textarea:focus {
  box-shadow: inset 0 0 0 1px var(--billadm-color-primary-light);
  border-radius: var(--billadm-radius-sm);
}

/* ---- 预览区 ---- */
.editor-preview {
  height: 100%;
  overflow-y: auto;
  padding: var(--billadm-space-md);
  line-height: var(--billadm-height-relaxed);
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-major);
}

/* Markdown 预览基础样式 */
.editor-preview :deep(h1) { font-size: 1.6em; margin: 1em 0 0.5em; font-weight: var(--billadm-weight-bold); }
.editor-preview :deep(h2) { font-size: 1.35em; margin: 0.9em 0 0.45em; font-weight: var(--billadm-weight-semibold); }
.editor-preview :deep(h3) { font-size: 1.15em; margin: 0.8em 0 0.4em; font-weight: var(--billadm-weight-semibold); }
.editor-preview :deep(p) { margin: 0.5em 0; }
.editor-preview :deep(ul), .editor-preview :deep(ol) { padding-left: 1.5em; margin: 0.5em 0; }
.editor-preview :deep(li) { margin: 0.25em 0; }
.editor-preview :deep(blockquote) {
  border-left: 2px solid var(--billadm-color-primary);
  margin: 0.6em 0;
  padding-left: var(--billadm-space-md);
  color: var(--billadm-color-text-secondary);
}
.editor-preview :deep(code) {
  font-family: var(--billadm-font-mono);
  font-size: 0.92em;
  background: var(--billadm-color-minor-background);
  padding: var(--billadm-space-2xs) var(--billadm-space-xs);
  border-radius: var(--billadm-radius-sm);
}
.editor-preview :deep(pre) {
  background: var(--billadm-color-minor-background);
  padding: var(--billadm-space-md);
  border-radius: var(--billadm-radius-md);
  overflow-x: auto;
  margin: 0.6em 0;
}
.editor-preview :deep(pre code) { background: none; padding: 0; }
.editor-preview :deep(img) { max-width: 100%; border-radius: var(--billadm-radius-md); }
.editor-preview :deep(hr) { border: none; border-top: 1px solid var(--billadm-color-divider); margin: 1em 0; }
.editor-preview :deep(a) { color: var(--billadm-color-primary); }

/* ---- 底部 ---- */
.editor-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: var(--billadm-space-sm);
  border-top: 1px solid var(--billadm-color-divider);
  flex-shrink: 0;
  min-height: var(--billadm-btn-height-md);
}

.footer-left,
.footer-right {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
}

.footer-hint {
  font-size: var(--billadm-size-text-small);
  color: var(--billadm-color-text-disabled);
}

.save-status {
  font-size: var(--billadm-size-text-caption);
  transition: opacity var(--billadm-transition-fast);
}

.save-status.is-saving {
  color: var(--billadm-color-text-disabled);
}

.save-status.is-saved {
  color: var(--billadm-color-primary);
  font-weight: var(--billadm-weight-medium);
}

.save-status.is-error {
  color: var(--billadm-color-expense);
  font-weight: var(--billadm-weight-medium);
}
</style>
