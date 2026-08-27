<template>
  <div class="position-page">
    <!-- 左中右三栏：参考关键事件页 -->
    <div class="position-body">
      <!-- 左栏：当前持仓卡片列表（参考关键事件页左栏） -->
      <aside class="position-left">
        <div v-if="positions.length" class="position-cards">
          <button
            v-for="p in positions"
            :key="p.stockCode"
            class="position-card"
            :class="{ active: p.stockCode === selectedCode }"
            @click="stockStore.selectStock(p.stockCode)"
          >
            <span class="position-card-name">{{ p.stockName }}</span>
            <span class="position-card-code">{{ p.stockCode }}</span>
            <span class="position-card-meta">
              {{ lotsText(p.quantity) }} · 成本 ¥{{ centsToYuan(p.totalCost) }} · 盈亏
              <span :class="pnlClass(p.realizedPnl)">{{ signedYuan(p.realizedPnl) }}</span>
            </span>
          </button>
        </div>
        <div v-else class="column-empty">
          <span class="panel-empty-text">暂无持仓</span>
        </div>
        <div class="panel-footer">
          <a-button type="primary" block @click="openTradeModal()">记录交易</a-button>
        </div>
      </aside>

      <!-- 中栏：交易规则 / 交易计划 / 交易复盘（参考关键事件页中栏） -->
      <div class="position-center">
        <template v-if="currentPosition">
          <div class="stock-identity">
            <span class="stock-identity-name">{{ currentPosition.stockName }}</span>
            <span class="stock-identity-code">{{ currentPosition.stockCode }}</span>
          </div>
          <div class="journal-tabs">
            <a-tabs v-model:activeKey="activeTab" class="journal-tabs-nav">
              <a-tab-pane v-for="tab in journalTabs" :key="tab.key" :tab="tab.label">
                <div v-if="editingTab === tab.key" class="journal-edit">
                  <a-textarea v-model:value="drafts[tab.key]" :rows="16" class="journal-textarea"
                    placeholder="支持 Markdown（表格/列表/加粗等）" />
                  <div class="journal-edit-actions">
                    <a-button @click="cancelEdit">取消</a-button>
                    <a-button type="primary" :loading="mutating" @click="saveEdit">保存</a-button>
                  </div>
                </div>
                <div v-else class="journal-view">
                  <MarkdownViewer v-if="(journal?.[tab.key] || '').trim()" :content="journal?.[tab.key] ?? ''" class="journal-md" />
                  <p v-else class="journal-empty">暂无内容，点击「编辑」开始记录</p>
                  <div class="journal-actions">
                    <a-button type="text" @click="startEdit(tab.key)">
                      <template #icon><EditOutlined /></template>
                      编辑
                    </a-button>
                  </div>
                </div>
              </a-tab-pane>
            </a-tabs>
          </div>
        </template>
        <div v-else class="column-empty">
          <span class="panel-empty-text">选择左侧持仓查看详情</span>
        </div>
      </div>

      <!-- 右栏：交易记录卡片（参考关键事件页右栏） -->
      <aside class="position-right">
        <div v-if="trades.length" class="trade-cards">
          <div v-for="t in trades" :key="t.id" class="trade-card">
            <div class="trade-card-head">
              <a-tag :class="isBuy(t.tradeType) ? 'tag-buy' : 'tag-sell'">{{ tradeTypeLabel(t.tradeType) }}</a-tag>
              <span class="trade-card-time">{{ formatTime(t.tradeTime) }}</span>
            </div>
            <div class="trade-card-main">
              <span class="trade-card-price amount">{{ centsToYuan(t.price) }}</span>
              <span class="trade-card-lots">× {{ t.lots }}手</span>
              <span class="trade-card-amount amount" :class="pnlClass(changeOf(t))">{{ signedYuan(changeOf(t)) }}</span>
            </div>
            <div class="trade-card-sub">
              {{ t.stockName }} {{ t.stockCode }}
              <template v-if="t.realizedPnl !== null"> · 盈亏 <span :class="pnlClass(t.realizedPnl)">{{ signedYuan(t.realizedPnl) }}</span></template>
              <template v-if="t.remark"> · {{ t.remark }}</template>
            </div>
          </div>
        </div>
        <div v-else class="column-empty">
          <span class="panel-empty-text">{{ currentPosition ? '暂无交易记录，点击「记录交易」建仓' : '暂无交易记录' }}</span>
        </div>
      </aside>
    </div>

    <!-- 记录交易弹窗 -->
    <a-modal v-model:open="tradeModal.open" title="记录交易" ok-text="记录" cancel-text="取消" centered
      :width="480" :confirm-loading="mutating" @ok="handleTradeSubmit">
      <a-form layout="vertical">
        <a-form-item label="交易类型" required>
          <a-select v-model:value="tradeModal.tradeType">
            <a-select-option value="open">建仓</a-select-option>
            <a-select-option value="add">加仓</a-select-option>
            <a-select-option value="reduce">减仓</a-select-option>
            <a-select-option value="close">清仓</a-select-option>
          </a-select>
        </a-form-item>
        <div class="trade-form-row">
          <a-form-item label="股票名称" required>
            <a-input v-model:value="tradeModal.stockName" placeholder="如 贵州茅台" />
          </a-form-item>
          <a-form-item label="股票代码" required>
            <a-input v-model:value="tradeModal.stockCode" placeholder="如 600519" />
          </a-form-item>
        </div>
        <div class="trade-form-row">
          <a-form-item label="股价（元/股）" required>
            <a-input v-model:value="tradeModal.price" placeholder="如 11.01" />
          </a-form-item>
          <a-form-item label="手数" required>
            <a-input v-model:value="tradeModal.lots" placeholder="如 1" />
          </a-form-item>
        </div>
        <a-form-item label="成交时间" required>
          <a-date-picker v-model:value="tradeModal.tradeTime" style="width: 100%" />
        </a-form-item>
        <a-form-item label="备注">
          <a-input v-model:value="tradeModal.remark" placeholder="选填" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { message } from 'ant-design-vue'
import { EditOutlined } from '@ant-design/icons-vue'
import { useStockPositionStore } from '@/stores/stockPositionStore'
import { centsToYuan } from '@/backend/functions'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'

const stockStore = useStockPositionStore()
const { positions, selectedCode, trades, journal, mutating } = storeToRefs(stockStore)

const currentPosition = computed(() =>
  positions.value.find((p) => p.stockCode === selectedCode.value) ?? null
)

// ---------- 展示 ----------
const tradeTypeLabels: Record<string, string> = {
  open: '建仓',
  add: '加仓',
  reduce: '减仓',
  close: '清仓',
}
const tradeTypeLabel = (t: string) => tradeTypeLabels[t] || t
const isBuy = (t: string) => t === 'open' || t === 'add'
const lotsText = (shares: number) => `${Math.floor(shares / 100)}手`
const signedYuan = (cents: number) => {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : ''
  return `${sign}¥${centsToYuan(Math.abs(cents))}`
}
const pnlClass = (cents: number) => (cents > 0 ? 'amount-income' : cents < 0 ? 'amount-expense' : '')
const formatTime = (t: number) => dayjs(t * 1000).format('YYYY-MM-DD HH:mm')
// 交易记录金额：买入为现金流出（负）、卖出为现金流入（正）
const changeOf = (t: { tradeType: string; amount: number; fee: number }) =>
  (isBuy(t.tradeType) ? -1 : 1) * (t.amount - t.fee)

// ---------- 中栏日志 ----------
const journalTabs = [
  { key: 'rules', label: '交易规则' },
  { key: 'plan', label: '交易计划' },
  { key: 'review', label: '交易复盘' },
] as const
type JournalKey = (typeof journalTabs)[number]['key']

const activeTab = ref<JournalKey>('rules')
const editingTab = ref<JournalKey | ''>('')
const drafts = reactive({ rules: '', plan: '', review: '' })

watch(
  () => journal.value,
  (j) => {
    if (j) {
      drafts.rules = j.rules
      drafts.plan = j.plan
      drafts.review = j.review
    }
  },
  { immediate: true }
)

const startEdit = (key: JournalKey) => {
  drafts[key] = journal.value?.[key] ?? ''
  editingTab.value = key
}
const cancelEdit = () => {
  editingTab.value = ''
}
const saveEdit = async () => {
  const ok = await stockStore.saveJournal(drafts.rules, drafts.plan, drafts.review)
  if (ok) editingTab.value = ''
}

// ---------- 记录交易 ----------
const tradeModal = reactive({
  open: false,
  tradeType: 'open' as 'open' | 'add' | 'reduce' | 'close',
  stockName: '',
  stockCode: '',
  price: '',
  lots: '',
  tradeTime: dayjs() as Dayjs,
  remark: '',
})

const openTradeModal = () => {
  tradeModal.tradeType = currentPosition.value ? 'add' : 'open'
  tradeModal.stockName = currentPosition.value?.stockName ?? ''
  tradeModal.stockCode = currentPosition.value?.stockCode ?? ''
  tradeModal.price = ''
  tradeModal.lots = ''
  tradeModal.tradeTime = dayjs()
  tradeModal.remark = ''
  tradeModal.open = true
}

const handleTradeSubmit = async () => {
  const price = parseFloat(tradeModal.price)
  const lots = parseInt(tradeModal.lots, 10)
  if (!tradeModal.stockName.trim()) {
    message.error('请输入股票名称')
    return
  }
  if (!/^\d{6}$/.test(tradeModal.stockCode.trim())) {
    message.error('请输入 6 位股票代码')
    return
  }
  if (isNaN(price) || price <= 0) {
    message.error('请输入有效的股价')
    return
  }
  if (isNaN(lots) || lots <= 0) {
    message.error('请输入有效手数')
    return
  }
  const ok = await stockStore.recordTrade({
    stockCode: tradeModal.stockCode.trim(),
    stockName: tradeModal.stockName.trim(),
    tradeType: tradeModal.tradeType,
    price,
    lots,
    tradeTime: tradeModal.tradeTime.unix(),
    remark: tradeModal.remark.trim(),
  })
  if (ok) tradeModal.open = false
}

onMounted(() => {
  stockStore.loadPositions()
})
</script>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.position-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ========== 三栏主体（参考关键事件页：统一容器 + hairline 分隔） ========== */
.position-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr) 320px;
  gap: 0;
  overflow: hidden;
  background-color: var(--transactions-color-major-background);
  border: 1px solid var(--transactions-color-window-border);
  border-radius: var(--transactions-radius-lg);
}

.position-left,
.position-right {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  padding: var(--transactions-space-md);
  background-color: var(--transactions-color-minor-background);
}

.position-left {
  border-right: 1px solid var(--transactions-color-divider);
}

.position-right {
  border-left: 1px solid var(--transactions-color-divider);
}

.position-center {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: var(--transactions-space-lg);
}

/* 空态纯文本（与关键事件页一致） */
.panel-empty-text {
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
}

.column-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--transactions-space-lg);
  padding: var(--transactions-space-xl);
}

/* 中栏：选中股标识行（对应关键事件页顶部功能行） */
.stock-identity {
  display: flex;
  align-items: baseline;
  gap: var(--transactions-space-sm);
  flex-shrink: 0;
  margin-bottom: var(--transactions-space-md);
  min-width: 0;
}

.stock-identity-name {
  font-family: var(--transactions-font-display);
  font-size: var(--transactions-size-text-title-sm);
  font-weight: 600;
  color: var(--transactions-color-text-major);
  line-height: var(--transactions-height-snug);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.stock-identity-code {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
}

/* 左栏底部主按钮（对应关键事件页「添加事件」） */
.panel-footer {
  flex-shrink: 0;
  padding-top: var(--transactions-space-md);
}

/* ========== 左栏：持仓卡片 ========== */
.position-cards {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: var(--transactions-space-xs);
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-sm);
  @include custom-scrollbar;
}

.position-card {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-xs);
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  border: none;
  border-radius: var(--transactions-radius-md);
  background-color: var(--transactions-color-major-background);
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  color: var(--transactions-color-text-secondary);
  transition: background-color var(--transactions-transition-smooth),
              box-shadow var(--transactions-transition-smooth),
              transform var(--transactions-transition-smooth);
  content-visibility: auto;
  contain-intrinsic-size: auto 64px;
}

.position-card:hover {
  background-color: var(--transactions-color-major-background);
  box-shadow: var(--transactions-shadow-sm);
  transform: translateX(2px);
}

.position-card.active {
  background-color: var(--transactions-color-active-bg);
  box-shadow: var(--transactions-shadow-sm);
}

.position-card.active:hover {
  box-shadow: var(--transactions-shadow-md);
}

.position-card:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 2px;
  box-shadow: var(--transactions-shadow-md);
}

.position-card-name {
  font-size: var(--transactions-size-text-body-sm);
  font-weight: 500;
  color: var(--transactions-color-text-major);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.position-card-code {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
}

.position-card-meta {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ========== 中栏：交易日志 Tab ========== */
.journal-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.journal-tabs-nav {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.journal-tabs-nav :deep(.ant-tabs-content-holder) {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  @include custom-scrollbar;
}

.journal-view {
  padding: var(--transactions-space-md) 0 0;
  min-height: 100%;
  display: flex;
  flex-direction: column;
}

.journal-empty {
  margin: 0;
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
}

.journal-md {
  flex: 1;
}

.journal-md :deep(table) {
  border-collapse: collapse;
  width: 100%;
  margin: var(--transactions-space-md) 0;
  font-size: var(--transactions-size-text-body-sm);
}

.journal-md :deep(th),
.journal-md :deep(td) {
  border: 1px solid var(--transactions-color-divider);
  padding: var(--transactions-space-xs) var(--transactions-space-sm);
  text-align: left;
  vertical-align: top;
  line-height: var(--transactions-height-snug);
}

.journal-md :deep(th) {
  background-color: var(--transactions-color-minor-background);
  font-weight: 500;
  white-space: nowrap;
}

.journal-md :deep(p) {
  margin: 0 0 var(--transactions-space-md);
  line-height: var(--transactions-height-relaxed);
}

.journal-md :deep(ul),
.journal-md :deep(ol) {
  margin: 0 0 var(--transactions-space-md);
  padding-left: var(--transactions-space-xl);
}

.journal-md :deep(li) {
  line-height: var(--transactions-height-relaxed);
}

.journal-md :deep(strong) {
  font-weight: 600;
}

.journal-actions {
  display: flex;
  justify-content: flex-end;
  margin-top: auto;
  padding-top: var(--transactions-space-md);
}

.journal-edit {
  padding: var(--transactions-space-md) 0 0;
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-md);
}

.journal-textarea {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-body-sm);
  line-height: var(--transactions-height-normal);
}

.journal-edit-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--transactions-space-sm);
}

/* ========== 右栏：交易记录卡片 ========== */
.trade-cards {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-sm);
  @include custom-scrollbar;
}

.trade-card {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-xs);
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  border: 1px solid var(--transactions-color-window-border);
  border-radius: var(--transactions-radius-md);
  background-color: var(--transactions-color-major-background);
  box-shadow: var(--transactions-shadow-sm);
  transition: box-shadow var(--transactions-transition-smooth);
  min-height: 68px;
  box-sizing: border-box;
  content-visibility: auto;
  contain-intrinsic-size: auto 68px;
}

.trade-card:hover {
  box-shadow: var(--transactions-shadow-md);
}

.trade-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--transactions-space-sm);
}

.trade-card-time {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-small);
  color: var(--transactions-color-text-tertiary);
}

.trade-card-main {
  display: flex;
  align-items: baseline;
  gap: var(--transactions-space-sm);
  min-width: 0;
}

.trade-card-price {
  font-size: var(--transactions-size-text-body);
  font-weight: 500;
  color: var(--transactions-color-text-major);
}

.trade-card-lots {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
}

.trade-card-amount {
  margin-left: auto;
  font-size: var(--transactions-size-text-body);
  font-weight: 500;
}

.trade-card-sub {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
  line-height: var(--transactions-height-snug);
  overflow-wrap: anywhere;
}

.tag-buy {
  background-color: var(--transactions-color-expense-tint);
  color: var(--transactions-color-expense);
}

.tag-sell {
  background-color: var(--transactions-color-income-tint);
  color: var(--transactions-color-income);
}

/* 弹窗表单两列 */
.trade-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--transactions-space-md);
}

@media (max-width: 1365px) {
  .position-body {
    grid-template-columns: minmax(0, 1fr);
    overflow: visible;
  }

  .position-left {
    border-right: none;
    border-bottom: 1px solid var(--transactions-color-divider);
  }

  .position-right {
    border-left: none;
    border-top: 1px solid var(--transactions-color-divider);
  }
}

@media (prefers-reduced-motion: reduce) {
  .position-card,
  .trade-card {
    transition: none;
  }

  .position-card:hover {
    transform: none;
  }
}
</style>
