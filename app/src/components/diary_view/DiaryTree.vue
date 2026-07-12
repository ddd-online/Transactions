<template>
  <div class="diary-tree">
    <!-- 空状态 -->
    <div v-if="yearNodes.length === 0" class="tree-empty">
      <span class="tree-empty-icon">📝</span>
      <span class="tree-empty-text">暂无日记</span>
      <span class="tree-empty-hint">点击「今天」开始写第一篇</span>
    </div>

    <!-- 树结构 -->
    <div v-else class="tree-scroll">
      <div v-for="year in yearNodes" :key="year.year" class="tree-year-group">
        <!-- 年份 -->
        <button
          class="tree-node tree-node-year"
          :class="{ expanded: year.expanded }"
          :aria-expanded="year.expanded"
          @click="toggleYear(year.year)"
        >
          <CaretRightOutlined class="tree-caret" :class="{ rotated: year.expanded }" />
          <span class="tree-label">{{ year.year }}年</span>
          <span class="tree-count">{{ year.count }}篇</span>
        </button>

        <!-- 月份 -->
        <div v-if="year.expanded" class="tree-children">
          <template v-for="month in year.months" :key="`${year.year}-${month.month}`">
            <button
              class="tree-node tree-node-month"
              :class="{ expanded: month.expanded }"
              :aria-expanded="month.expanded"
              @click="toggleMonth(year.year, month.month)"
            >
              <CaretRightOutlined class="tree-caret tree-caret-sm" :class="{ rotated: month.expanded }" />
              <span class="tree-label">{{ month.month }}月</span>
              <span class="tree-count">{{ month.days.length }}篇</span>
            </button>

            <!-- 日期 -->
            <div v-if="month.expanded" class="tree-children">
              <button
                v-for="day in month.days"
                :key="day.date"
                class="tree-node tree-node-day"
                :class="{ active: selectedDate === day.date }"
                @click="$emit('select', day.date)"
              >
                <span class="tree-day-num">{{ day.dayOfMonth }}</span>
                <span v-if="day.mood" class="tree-mood" aria-hidden="true">{{ day.mood }}</span>
                <span class="tree-word-count">{{ day.wordCount }}字</span>
              </button>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CaretRightOutlined } from '@ant-design/icons-vue'
import type { DiaryDateItem } from '@/types/billadm'

const props = defineProps<{
  dates: DiaryDateItem[]
  selectedDate: string
}>()

defineEmits<{
  select: [date: string]
}>()

// ---- 数据结构 ----

interface DayNode {
  date: string
  dayOfMonth: number
  wordCount: number
  mood: string
}

interface MonthNode {
  month: number
  expanded: boolean
  days: DayNode[]
}

interface YearNode {
  year: number
  expanded: boolean
  count: number
  months: MonthNode[]
}

// ---- 折叠状态 ----

const collapsedYears = ref<Set<number>>(new Set())
const expandedMonths = ref<Set<string>>(new Set()) // "2026-7"

const toggleYear = (year: number) => {
  if (collapsedYears.value.has(year)) {
    collapsedYears.value.delete(year)
  } else {
    collapsedYears.value.add(year)
  }
  // 触发响应式
  collapsedYears.value = new Set(collapsedYears.value)
}

const toggleMonth = (year: number, month: number) => {
  const key = `${year}-${month}`
  if (expandedMonths.value.has(key)) {
    expandedMonths.value.delete(key)
  } else {
    expandedMonths.value.add(key)
  }
  expandedMonths.value = new Set(expandedMonths.value)
}

// ---- 构建树 ----

const yearNodes = computed<YearNode[]>(() => {
  const yearMap = new Map<number, Map<number, DayNode[]>>()

  for (const d of props.dates) {
    const [yStr, mStr, dStr] = d.date.split('-')
    const y = parseInt(yStr!, 10)
    const m = parseInt(mStr!, 10)
    const dayNum = parseInt(dStr!, 10)

    if (!yearMap.has(y)) yearMap.set(y, new Map())
    const monthMap = yearMap.get(y)!
    if (!monthMap.has(m)) monthMap.set(m, [])
    monthMap.get(m)!.push({
      date: d.date,
      dayOfMonth: dayNum,
      wordCount: d.wordCount,
      mood: d.mood,
    })
  }

  const years: YearNode[] = []
  const sortedYears = [...yearMap.keys()].sort((a, b) => b - a)

  for (const y of sortedYears) {
    const monthMap = yearMap.get(y)!
    const sortedMonths = [...monthMap.keys()].sort((a, b) => b - a)

    let totalCount = 0
    const months: MonthNode[] = []

    for (const m of sortedMonths) {
      const days = monthMap.get(m)!
      days.sort((a, b) => b.date.localeCompare(a.date))
      totalCount += days.length
      months.push({
        month: m,
        expanded: expandedMonths.value.has(`${y}-${m}`),
        days,
      })
    }

    years.push({
      year: y,
      expanded: !collapsedYears.value.has(y),
      count: totalCount,
      months,
    })
  }

  return years
})

// ---- 初始化：默认全部收起 ----

let initialized = false

watch(() => props.dates.length, (len) => {
  if (len > 0 && !initialized) {
    initialized = true
    // 所有年份默认折叠
    for (const y of yearNodes.value) {
      collapsedYears.value.add(y.year)
    }
    collapsedYears.value = new Set(collapsedYears.value)
  }
}, { immediate: true })
</script>

<style scoped>
.diary-tree {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  user-select: none;
  /* 脱字符宽度令牌 — 节点缩进 calc() 和 .tree-caret 共用 */
  --diary-tree-caret-width: 12px;
}

/* ---- 空状态 ---- */
.tree-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--billadm-space-xs);
  height: 100%;
  padding: var(--billadm-space-xl);
}

.tree-empty-icon {
  font-size: 28px;
  opacity: 0.5;
  margin-bottom: var(--billadm-space-xs);
}

.tree-empty-text {
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-secondary);
}

.tree-empty-hint {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
}

/* ---- 滚动区 ---- */
.tree-scroll {
  flex: 1;
  overflow-y: auto;
  padding: var(--billadm-space-xs) var(--billadm-space-sm) var(--billadm-space-xs) 0;

  &::-webkit-scrollbar {
    width: 5px;
  }

  &::-webkit-scrollbar-track {
    background: transparent;
    margin-block: var(--billadm-space-xs);
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(141, 127, 111, 0.18);
    border-radius: 8px;
    transition: background 0.3s ease;
  }
}

.tree-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(141, 127, 111, 0.40);
}

/* 年份分组之间留白 — 2:1 节奏：组间 > 组内 */
.tree-year-group + .tree-year-group {
  margin-top: var(--billadm-space-sm);
}

/* 子节点缩进容器 */
.tree-children {
  overflow: hidden;
}

/* ---- 树节点基础 ---- */
.tree-node {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-2xs);
  width: 100%;
  padding: var(--billadm-space-xs) var(--billadm-space-xs);
  border: none;
  background: none;
  cursor: pointer;
  font-family: inherit;
  font-size: var(--billadm-size-text-body-sm);
  font-weight: var(--billadm-weight-regular);
  color: var(--billadm-color-text-secondary);
  text-align: left;
  transition: background var(--billadm-transition-fast),
              color var(--billadm-transition-fast);
  border-radius: var(--billadm-radius-sm);
  line-height: var(--billadm-height-snug);
}

.tree-node:hover {
  background: var(--billadm-color-hover-bg);
}

.tree-node:active {
  background: var(--billadm-color-active-bg);
}

.tree-node:focus-visible {
  outline: 2px solid var(--billadm-color-primary);
  outline-offset: -2px;
}

/* 年份节点 */
.tree-node-year {
  font-weight: var(--billadm-weight-semibold);
  color: var(--billadm-color-text-major);
  padding: var(--billadm-space-sm) var(--billadm-space-xs);
}

/* 月份节点 */
.tree-node-month {
  padding-left: calc(var(--billadm-space-lg) + var(--billadm-space-xs) + var(--diary-tree-caret-width));
  font-weight: var(--billadm-weight-medium);
}

/* 日期节点 — 常规字重 vs 月份的 medium，眯眼测试中可区分 */
.tree-node-day {
  padding-left: calc(var(--billadm-space-lg) + var(--billadm-space-lg) + var(--billadm-space-lg) + var(--diary-tree-caret-width));
}

.tree-node-day.active {
  background: var(--billadm-color-active-bg);
  color: var(--billadm-color-primary);
  font-weight: var(--billadm-weight-medium);
}

/* ---- 展开箭头 ---- */
.tree-caret {
  font-size: 10px;
  flex-shrink: 0;
  width: var(--diary-tree-caret-width);
  color: var(--billadm-color-text-disabled);
  transition: transform var(--billadm-transition-fast);
}

.tree-caret.rotated {
  transform: rotate(90deg);
}

.tree-caret-sm {
  font-size: 8px;
}

/* ---- 标签 ---- */
.tree-label {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tree-day-num {
  flex: 1;
  font-variant-numeric: tabular-nums;
}

/* ---- 元数据 ---- */
.tree-count {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-disabled);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}

.tree-mood {
  font-size: var(--billadm-size-text-caption);
  flex-shrink: 0;
  line-height: 1;
}

.tree-word-count {
  font-size: var(--billadm-size-text-small);
  color: var(--billadm-color-text-disabled);
  flex-shrink: 0;
  font-variant-numeric: tabular-nums;
}
</style>
