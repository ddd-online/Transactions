<template>
  <div class="position-page">
    <!-- 两栏：左持仓列表 + 中股票详情/交易记录 -->
    <div class="position-body">
      <!-- 左栏：当前持仓卡片列表（参考关键事件页左栏） -->
      <aside class="position-left">
        <div v-if="positionsLoading && !positions.length" class="position-cards" aria-hidden="true">
          <div v-for="i in 3" :key="i" class="position-card position-card-skeleton">
            <span class="skeleton-bar skeleton-name" />
            <span class="skeleton-bar skeleton-meta" />
          </div>
        </div>
        <div v-else-if="positions.length" class="position-cards">
          <div
            v-for="p in positions"
            :key="p.stockCode"
            class="position-card"
            :class="{ active: p.stockCode === selectedCode }"
            role="button"
            tabindex="0"
            @click="stockStore.selectStock(p.stockCode)"
            @keydown.enter.self="stockStore.selectStock(p.stockCode)"
            @keydown.space.self.prevent="stockStore.selectStock(p.stockCode)"
          >
            <span class="position-card-name">{{ p.stockName }}</span>
            <div class="position-card-code-row">
              <span class="position-card-code">{{ p.stockCode }}</span>
              <span class="position-card-lots">持仓 {{ lotsText(p.quantity) }}</span>
            </div>
            <template v-if="hasQuote(p)">
              <div class="position-card-quote-line">
                <span class="position-card-quote-label">现价</span>
                <span class="position-card-quote-value amount">¥{{ centsToYuan(quotePriceOf(p)) }}</span>
                <span class="amount" :class="pnlClass(dayChangeOf(p) ?? 0)">{{ signedPercent(dayRateOf(p)) }}</span>
              </div>
              <div class="position-card-quote-line">
                <span class="position-card-quote-label">浮盈</span>
                <span class="position-card-quote-value amount" :class="pnlClass(floatPnlOf(p) ?? 0)">
                  {{ signedYuan(floatPnlOf(p) ?? 0) }}
                </span>
                <span class="amount" :class="pnlClass(floatPnlOf(p) ?? 0)">{{ signedPercent(floatRateOf(p)) }}</span>
              </div>
            </template>
            <div v-else class="position-card-quote-line position-card-quote-line--empty">
              <span class="position-card-quote-label">现价</span>
              <span>—</span>
              <span class="position-card-quote-label">浮盈</span>
              <span>—</span>
            </div>
          </div>
        </div>
        <div v-else class="column-empty">
          <span class="panel-empty-text">暂无持仓</span>
        </div>
        <div class="panel-footer">
          <a-button type="primary" block @click="openTradeModal('open')">建仓</a-button>
        </div>
      </aside>

      <!-- 中栏：股票详情 + 交易记录表格 -->
      <div class="position-center">
        <template v-if="centerStock">
          <div class="stock-identity">
            <span class="stock-identity-name">{{ centerStock.stockName }}</span>
            <span class="stock-identity-code">{{ centerStock.stockCode }}</span>
            <div v-if="currentPosition" class="stock-identity-actions">
              <a-button danger @click="openTradeModal('close')">清仓</a-button>
              <a-button @click="openTradeModal('reduce')">减仓</a-button>
              <a-button type="primary" @click="openTradeModal('add')">加仓</a-button>
            </div>
          </div>
          <div v-if="currentPosition" class="stock-quote-panel">
            <div v-if="hasQuote(currentPosition)" class="stock-quote-stats">
              <div class="stock-quote-stat">
                <span class="stock-quote-stat-label">现价</span>
                <span class="stock-quote-stat-value amount">¥{{ centsToYuan(quotePriceOf(currentPosition)) }}</span>
              </div>
              <div class="stock-quote-stat">
                <span class="stock-quote-stat-label">当日涨跌</span>
                <span class="stock-quote-stat-value amount" :class="pnlClass(dayChangeOf(currentPosition) ?? 0)">
                  {{ signedYuan(dayChangeOf(currentPosition) ?? 0) }} {{ signedPercent(dayRateOf(currentPosition)) }}
                </span>
              </div>
              <div class="stock-quote-stat">
                <span class="stock-quote-stat-label">持仓市值</span>
                <span class="stock-quote-stat-value amount">¥{{ centsToYuan(marketValueOf(currentPosition)) }}</span>
              </div>
              <div class="stock-quote-stat">
                <span class="stock-quote-stat-label">当前盈亏</span>
                <span class="stock-quote-stat-value amount" :class="pnlClass(floatPnlOf(currentPosition) ?? 0)">
                  {{ signedYuan(floatPnlOf(currentPosition) ?? 0) }} {{ signedPercent(floatRateOf(currentPosition)) }}
                </span>
              </div>
            </div>
            <div v-else class="stock-quote-empty-text">暂未获取到行情</div>
            <a-button class="stock-quote-refresh" size="small" :loading="quotesRefreshing" @click="refreshQuotes">
              <template #icon>
                <ReloadOutlined />
              </template>
              刷新行情
            </a-button>
          </div>
          <div class="trade-table-wrap">
            <a-table :columns="columns" :data-source="trades" row-key="id"
              :pagination="false" :loading="tradesLoading" size="middle" class="trade-table"
              :locale="{ emptyText: currentPosition ? '暂无交易历史，点击「建仓」开始' : '暂无交易历史' }">
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'tradeTime'">
                  <span class="cell-date">{{ formatTime(record.tradeTime) }}</span>
                </template>
                <template v-else-if="column.dataIndex === 'tradeType'">
                  <a-tag :class="isBuy(record.tradeType) ? 'tag-buy' : 'tag-sell'">
                    {{ tradeTypeLabel(record.tradeType) }}
                  </a-tag>
                </template>
                <template v-else-if="column.dataIndex === 'price'">
                  <span class="cell-amount">{{ centsToYuan(record.price) }}</span>
                </template>
                <template v-else-if="column.dataIndex === 'lots'">
                  <span class="cell-lots">{{ record.lots }}手</span>
                </template>
                <template v-else-if="column.dataIndex === 'amount'">
                  <span class="cell-amount">{{ centsToYuan(record.amount) }}</span>
                </template>
                <template v-else-if="column.dataIndex === 'fee'">
                  <span class="cell-fee">
                    <template v-if="hasFeeBreakdown(record)">
                      <template v-if="isBuy(record.tradeType)">
                        佣金 ¥{{ centsToYuan(record.commission) }} + 过户费 ¥{{ centsToYuan(record.transferFee) }}
                      </template>
                      <template v-else>
                        佣金 ¥{{ centsToYuan(record.commission) }} + 印花税 ¥{{ centsToYuan(record.stampDuty) }} + 过户费 ¥{{ centsToYuan(record.transferFee) }}
                      </template>
                    </template>
                    <template v-else>
                      ¥{{ centsToYuan(record.fee) }}
                    </template>
                  </span>
                </template>
                <template v-else-if="column.dataIndex === 'change'">
                  <span class="cell-change amount" :class="pnlClass(changeOf(record))">
                    {{ signedYuan(changeOf(record)) }}
                  </span>
                </template>
              </template>
            </a-table>
          </div>
        </template>
        <div v-else class="column-empty">
          <span class="panel-empty-text">选择左侧持仓查看详情</span>
        </div>
      </div>
    </div>

    <!-- 记录交易弹窗：交易类型由入口按钮决定 -->
    <a-modal v-model:open="tradeModal.open" :title="`记录${tradeTypeLabel(tradeModal.tradeType)}`"
      :ok-text="tradeTypeLabel(tradeModal.tradeType)" cancel-text="取消" centered
      :width="480" :confirm-loading="mutating" @ok="handleTradeSubmit">
      <a-form layout="vertical">
        <div class="trade-form-row">
          <a-form-item label="股票名称" required>
            <a-input v-model:value="tradeModal.stockName" :disabled="tradeModal.tradeType !== 'open'" />
          </a-form-item>
          <a-form-item label="股票代码" required>
            <a-input v-model:value="tradeModal.stockCode" :disabled="tradeModal.tradeType !== 'open'"
              @blur="handleStockCodeBlur" />
          </a-form-item>
        </div>
        <div class="trade-form-row">
          <a-form-item label="成交价（元/股）" required>
            <a-input v-model:value="tradeModal.price" />
          </a-form-item>
          <a-form-item :label="lotsLabel" required>
            <a-input v-model:value="tradeModal.lots" :disabled="tradeModal.tradeType === 'close'" />
          </a-form-item>
        </div>
        <a-form-item label="成交时间" required>
          <a-date-picker v-model:value="tradeModal.tradeTime" style="width: 100%" />
        </a-form-item>
      </a-form>
    </a-modal>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { message } from 'ant-design-vue'
import { ReloadOutlined } from '@ant-design/icons-vue'
import { useStockPositionStore } from '@/stores/stockPositionStore'
import { fetchStockName } from '@/backend/api/stock'
import { tryOrFallback } from '@/backend/errorHandler'
import { centsToYuan } from '@/backend/functions'
import type { StockPosition } from '@/types/transactions'
import type { ColumnsType } from 'ant-design-vue/es/table'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'

const stockStore = useStockPositionStore()
const { positions, positionsLoading, selectedCode, trades, tradesLoading, mutating, quotesRefreshing } = storeToRefs(stockStore)
const { refreshQuotes } = stockStore

interface Props {
  /** 当前 Tab 是否处于「我的持仓」（用于切回时自动刷新行情） */
  active?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  active: true,
})

const currentPosition = computed(() =>
  positions.value.find((p) => p.stockCode === selectedCode.value) ?? null
)

// 清仓后选中股不在持仓中，仍用最近一条交易记录展示股票详情
const centerStock = computed(() => {
  if (currentPosition.value) return currentPosition.value
  const first = trades.value[0]
  return first ? { stockName: first.stockName, stockCode: first.stockCode } : null
})

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
// 新记录的交易带费用明细；历史交易无明细时退回仅显示手续费合计
type TradeCell = Record<string, any>
const hasFeeBreakdown = (t: TradeCell) =>
  t.commission + t.stampDuty + t.transferFee > 0
const signedYuan = (cents: number) => {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : ''
  return `${sign}¥${centsToYuan(Math.abs(cents))}`
}
const pnlClass = (cents: number) => (cents > 0 ? 'amount-income' : cents < 0 ? 'amount-expense' : '')
const formatTime = (t: number) => dayjs(t * 1000).format('YYYY-MM-DD HH:mm')
const hasQuote = (p: StockPosition): boolean => !!p.latestPrice && p.latestPrice > 0
const quotePriceOf = (p: StockPosition): number => p.latestPrice ?? 0
const dayChangeOf = (p: StockPosition): number | null => {
  const latest = quotePriceOf(p)
  return hasQuote(p) && p.prevClose ? latest - p.prevClose : null
}
const dayRateOf = (p: StockPosition): number | null => {
  const change = dayChangeOf(p)
  return change === null || !p.prevClose ? null : (change / p.prevClose) * 100
}
const floatPnlOf = (p: StockPosition): number | null =>
  hasQuote(p) ? quotePriceOf(p) * p.quantity - p.totalCost : null
const floatRateOf = (p: StockPosition): number | null => {
  const pnl = floatPnlOf(p)
  return pnl === null || p.totalCost <= 0 ? null : (pnl / p.totalCost) * 100
}
const marketValueOf = (p: StockPosition): number => (hasQuote(p) ? quotePriceOf(p) * p.quantity : p.totalCost)
const signedPercent = (rate: number | null): string =>
  rate === null ? '—' : `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`
// 交易历史金额：买入现金流出 = -(成交金额 + 费用)，卖出现金流入 = 成交金额 - 费用
const changeOf = (t: TradeCell) =>
  isBuy(t.tradeType) ? -(t.amount + t.fee) : t.amount - t.fee

// ---------- 交易记录表格 ----------
const columns: ColumnsType = [
  { title: '时间', dataIndex: 'tradeTime', width: 150, align: 'center' },
  { title: '类型', dataIndex: 'tradeType', width: 90, align: 'center' },
  { title: '成交价', dataIndex: 'price', width: 100, align: 'right' },
  { title: '手数', dataIndex: 'lots', width: 80, align: 'center' },
  { title: '成交金额', dataIndex: 'amount', width: 120, align: 'right' },
  { title: '手续费', dataIndex: 'fee', minWidth: 220 },
  { title: '资金变动', dataIndex: 'change', width: 120, align: 'right' },
]

// ---------- 记录交易 ----------
type TradeType = 'open' | 'add' | 'reduce' | 'close'

const tradeModal = reactive({
  open: false,
  tradeType: 'open' as TradeType,
  stockName: '',
  stockCode: '',
  price: '',
  lots: '',
  tradeTime: dayjs() as Dayjs,
  availableLots: 0,
})

// 手数列标签：加仓/减仓展示可用手数，清仓展示全仓手数
const lotsLabel = computed(() => {
  if (tradeModal.tradeType === 'open' || tradeModal.availableLots <= 0) return '手数'
  return tradeModal.tradeType === 'close'
    ? `手数（全仓 ${tradeModal.availableLots} 手）`
    : `手数（可用 ${tradeModal.availableLots} 手）`
})

const resetTradeModal = (tradeType: TradeType, position: StockPosition | null) => {
  tradeModal.tradeType = tradeType
  // 建仓始终从空白开始；加仓/减仓/清仓自动带入对应股票
  const prefill = tradeType === 'open' ? null : position
  tradeModal.stockName = prefill?.stockName ?? ''
  tradeModal.stockCode = prefill?.stockCode ?? ''
  tradeModal.price = ''
  tradeModal.lots = tradeType === 'close' && prefill ? String(Math.floor(prefill.quantity / 100)) : ''
  tradeModal.availableLots = prefill ? Math.floor(prefill.quantity / 100) : 0
  tradeModal.tradeTime = dayjs()
}

const openTradeModal = (tradeType: TradeType, position?: StockPosition) => {
  resetTradeModal(tradeType, position ?? currentPosition.value ?? null)
  tradeModal.open = true
}

// 建仓时输入股票代码后自动查询并填充股票名称（查询失败保持为空，可手动填写）
const handleStockCodeBlur = async () => {
  const code = tradeModal.stockCode.trim()
  if (tradeModal.tradeType !== 'open' || !code || tradeModal.stockName.trim()) return
  if (!/^(60|68|00|30)\d{4}$/.test(code)) return
  const name = await tryOrFallback(() => fetchStockName(code), '')
  if (name && !tradeModal.stockName.trim()) {
    tradeModal.stockName = name
  }
}

const handleTradeSubmit = async () => {
  const price = parseFloat(tradeModal.price)
  const lots = parseInt(tradeModal.lots, 10)
  if (!tradeModal.stockName.trim()) {
    message.error('请输入股票名称')
    return
  }
  if (!/^(60|68|00|30)\d{4}$/.test(tradeModal.stockCode.trim())) {
    message.error('请输入有效的沪深股票代码（沪 60/68、深 00/30 开头）')
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
  if (tradeModal.tradeType === 'reduce' && lots > tradeModal.availableLots) {
    message.error(`减仓手数不能超过可用手数（${tradeModal.availableLots} 手）`)
    return
  }
  // 减仓手数等于可用手数即为清仓
  const submitType: TradeType =
    tradeModal.tradeType === 'reduce' && tradeModal.availableLots > 0 && lots === tradeModal.availableLots
      ? 'close'
      : tradeModal.tradeType
  const ok = await stockStore.recordTrade({
    stockCode: tradeModal.stockCode.trim(),
    stockName: tradeModal.stockName.trim(),
    tradeType: submitType,
    price,
    lots,
    tradeTime: tradeModal.tradeTime.unix(),
    remark: '',
  })
  if (ok) tradeModal.open = false
}

onMounted(() => {
  stockStore.loadPositions()
})

// 从其他 Tab 切回持仓页时自动刷新行情；首次挂载时 loadPositions 已携带行情
watch(
  () => props.active,
  (active, previous) => {
    if (active && previous === false && !quotesRefreshing.value) {
      stockStore.refreshQuotes()
    }
  }
)
</script>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

/* A股习惯：红涨绿跌——股票页盈亏覆盖全局记账语义色 */
.position-page .amount-income {
  color: var(--transactions-color-expense);
}

.position-page .amount-expense {
  color: var(--transactions-color-income);
}

.position-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ========== 两栏主体（左持仓列表 + 中股票详情/交易记录） ========== */
.position-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  gap: 0;
  overflow: hidden;
  background-color: var(--transactions-color-major-background);
  border: 1px solid var(--transactions-color-window-border);
  border-radius: var(--transactions-radius-lg);
}

.position-left {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  padding: var(--transactions-space-md);
  background-color: var(--transactions-color-minor-background);
  border-right: 1px solid var(--transactions-color-divider);
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
  align-items: center;
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

.stock-identity-actions {
  margin-left: auto;
  display: flex;
  gap: var(--transactions-space-sm);
  flex-shrink: 0;
}

/* ========== 中栏：行情面板 ========== */
.stock-quote-panel {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-lg);
  flex-shrink: 0;
  margin-bottom: var(--transactions-space-md);
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  background-color: var(--transactions-color-minor-background);
  border-radius: var(--transactions-radius-md);
  min-width: 0;
}

.stock-quote-stats {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  row-gap: var(--transactions-space-sm);
}

.stock-quote-stat {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-2xs);
  padding: 0 var(--transactions-space-lg);
  border-left: 1px solid var(--transactions-color-divider);
  min-width: 0;
}

.stock-quote-stat:first-child {
  padding-left: 0;
  border-left: none;
}

.stock-quote-stat-label {
  font-size: var(--transactions-size-text-caption);
  font-weight: var(--transactions-weight-medium);
  color: var(--transactions-color-text-tertiary);
  line-height: var(--transactions-height-snug);
  white-space: nowrap;
}

.stock-quote-stat-value {
  font-size: var(--transactions-size-text-body);
  font-weight: var(--transactions-weight-medium);
  white-space: nowrap;
}

.stock-quote-empty-text {
  flex: 1;
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
}

.stock-quote-refresh {
  flex-shrink: 0;
}

/* 左栏底部主按钮（对应关键事件页「添加事件」） */
.panel-footer {
  flex-shrink: 0;
  border-top: 1px solid var(--transactions-color-divider);
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
  min-height: 112px;
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
  contain-intrinsic-size: auto 112px;
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

.position-card-code-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--transactions-space-sm);
  min-width: 0;
  margin-top: auto;
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
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.position-card-lots {
  flex-shrink: 0;
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  white-space: nowrap;
}

.position-card-quote-line {
  display: flex;
  align-items: baseline;
  gap: var(--transactions-space-xs);
  min-width: 0;
  font-size: var(--transactions-size-text-caption);
}

.position-card-quote-line--empty {
  color: var(--transactions-color-text-disabled);
}

.position-card-quote-line .amount:last-child {
  margin-left: auto;
}

.position-card-quote-label {
  flex-shrink: 0;
  color: var(--transactions-color-text-tertiary);
}

.position-card-quote-value {
  color: var(--transactions-color-text-major);
  white-space: nowrap;
}

/* 持仓列表加载骨架 */
.position-card-skeleton {
  cursor: default;
  pointer-events: none;
  justify-content: center;
  gap: var(--transactions-space-md);
}

.position-card-skeleton:hover {
  transform: none;
  box-shadow: none;
}

.skeleton-bar {
  display: block;
  border-radius: var(--transactions-radius-sm);
  background: var(--transactions-color-minor-background);
  animation: skeleton-pulse 1.4s ease-in-out infinite;
}

.skeleton-name {
  width: 60%;
  height: 14px;
}

.skeleton-meta {
  width: 80%;
  height: 12px;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

/* ========== 中栏：交易记录表格 ========== */
.trade-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  @include custom-scrollbar;
}

.trade-table {
  width: 100%;
  min-width: 880px;
}

.trade-table :deep(.ant-table) {
  background: transparent;
}

.trade-table :deep(.ant-table-thead > tr > th) {
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-caption);
  font-weight: 500;
  color: var(--transactions-color-text-secondary);
  background-color: var(--transactions-color-minor-background);
  border-bottom: 1px solid var(--transactions-color-divider);
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  position: sticky;
  top: 0;
  z-index: 1;
}

.trade-table :deep(.ant-table-tbody > tr > td) {
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-major);
  border-bottom: 1px solid var(--transactions-color-divider);
  padding: var(--transactions-space-sm) var(--transactions-space-md);
}

.trade-table :deep(.ant-table-tbody > tr:hover > td) {
  background-color: var(--transactions-color-hover-bg);
}

.cell-date {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.cell-amount {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-body);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  white-space: nowrap;
}

.cell-lots {
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-secondary);
  white-space: nowrap;
}

.cell-fee {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
  line-height: var(--transactions-height-snug);
  overflow-wrap: anywhere;
}

.cell-change {
  font-size: var(--transactions-size-text-body);
  font-weight: 500;
  white-space: nowrap;
}

.tag-buy {
  background-color: var(--transactions-color-income-tint);
  color: var(--transactions-color-income);
}

.tag-sell {
  background-color: var(--transactions-color-expense-tint);
  color: var(--transactions-color-expense);
}

/* 弹窗表单两列 */
.trade-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--transactions-space-md);
}

@media (max-width: 1080px) {
  .position-body {
    grid-template-columns: minmax(0, 1fr);
    overflow: visible;
  }

  .position-left {
    border-right: none;
    border-bottom: 1px solid var(--transactions-color-divider);
  }
}

@media (prefers-reduced-motion: reduce) {
  .position-card {
    transition: none;
  }

  .position-card:hover {
    transform: none;
  }

  .skeleton-bar {
    animation: none;
    opacity: 0.6;
  }
}
</style>
