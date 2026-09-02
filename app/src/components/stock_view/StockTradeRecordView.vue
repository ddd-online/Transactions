<template>
  <div class="history-page">
    <!-- 全局汇总：全部已清仓股票的盈亏、胜负与轮次 -->
    <section v-if="summary && histories.length" class="history-summary history-summary-global">
      <div class="history-summary-identity">
        <span class="history-summary-title">全部已清仓股票</span>
      </div>
      <div class="history-summary-stats">
        <div class="summary-stat summary-stat-total">
          <span class="summary-stat-label">总盈亏</span>
          <span class="summary-stat-value summary-stat-total-value amount" :class="pnlClass(summary.totalPnl)">
            {{ signedYuan(summary.totalPnl) }}
          </span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-label">累计盈亏率</span>
          <span class="summary-stat-value amount" :class="pnlClass(summary.totalPnl)">{{ rateText(summary.totalPnlRate) }}</span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-label">胜负轮次</span>
          <span class="summary-stat-value">
            <span class="amount" :class="summary.winCount ? 'amount-income' : ''">{{ summary.winCount }} 胜</span>
            <span class="summary-stat-divider">·</span>
            <span class="amount" :class="summary.lossCount ? 'amount-expense' : ''">{{ summary.lossCount }} 负</span>
          </span>
        </div>
        <div class="summary-stat">
          <span class="summary-stat-label">总轮次</span>
          <span class="summary-stat-value">{{ summary.roundCount }} 轮</span>
        </div>
      </div>
    </section>

    <!-- 两栏：左股票集合 + 右轮次明细 -->
    <div class="history-body">
      <!-- 左栏：已清仓股票集合 -->
      <aside class="history-left">
        <div class="history-left-head">
          <span class="history-left-title">已清仓股票</span>
        </div>

        <div v-if="historiesLoading && !histories.length" class="history-cards" aria-hidden="true">
          <div v-for="i in 3" :key="i" class="history-card history-card-skeleton">
            <span class="skeleton-bar skeleton-name" />
            <span class="skeleton-bar skeleton-code" />
          </div>
        </div>
        <div v-else-if="histories.length" class="history-cards">
          <button
            v-for="h in histories"
            :key="h.stockCode"
            class="history-card"
            :class="{ active: h.stockCode === historyStore.selectedCode }"
            type="button"
            @click="historyStore.selectStock(h.stockCode)"
            @keydown.enter="historyStore.selectStock(h.stockCode)"
            @keydown.space.prevent="historyStore.selectStock(h.stockCode)"
          >
            <span class="history-card-name">{{ h.stockName }}</span>
            <span class="history-card-code">{{ h.stockCode }}</span>
            <span class="history-card-meta">{{ h.roundCount }} 轮 · 最近 {{ formatDate(h.lastClosedAt) }}</span>
          </button>
        </div>
        <div v-else class="column-empty">
          <span class="panel-empty-text">暂无已清仓股票</span>
        </div>
      </aside>

      <!-- 右栏：选中股票的总盈亏 + 每轮交易 -->
      <div class="history-center">
        <!-- 全空态 -->
        <div v-if="!histories.length && !historiesLoading" class="column-empty history-empty">
          <div class="history-empty-inner">
            <div class="history-empty-head">
              <span class="history-empty-title">还没有交易历史</span>
              <a-tooltip :overlay-style="{ maxWidth: '340px' }">
                <template #title>持仓股票清仓后，这一轮从建仓到清仓的每一笔交易会自动归档到这里</template>
                <QuestionCircleOutlined class="history-empty-tip" aria-label="交易历史说明" />
              </a-tooltip>
            </div>
          </div>
        </div>

        <template v-else-if="detail">
          <!-- 汇总条：该股总盈亏 -->
          <section class="history-summary">
            <div class="history-summary-identity">
              <span class="stock-identity-name">{{ detail.stockName }}</span>
              <span class="stock-identity-code">{{ detail.stockCode }}</span>
            </div>
            <div class="history-summary-stats">
              <div class="summary-stat summary-stat-total">
                <span class="summary-stat-label">总盈亏</span>
                <span class="summary-stat-value summary-stat-total-value amount" :class="pnlClass(detail.totalPnl)">
                  {{ signedYuan(detail.totalPnl) }}
                </span>
              </div>
              <div class="summary-stat">
                <span class="summary-stat-label">累计盈亏率</span>
                <span class="summary-stat-value amount" :class="pnlClass(detail.totalPnl)">{{ rateText(detail.totalPnlRate) }}</span>
              </div>
              <div class="summary-stat">
                <span class="summary-stat-label">胜负轮次</span>
                <span class="summary-stat-value">
                  <span class="amount" :class="detail.winCount ? 'amount-income' : ''">{{ detail.winCount }} 胜</span>
                  <span class="summary-stat-divider">·</span>
                  <span class="amount" :class="detail.lossCount ? 'amount-expense' : ''">{{ detail.lossCount }} 负</span>
                </span>
              </div>
              <div class="summary-stat">
                <span class="summary-stat-label">已完成轮次</span>
                <span class="summary-stat-value">{{ detail.roundCount }} 轮</span>
              </div>
            </div>
          </section>

          <!-- 轮次列表 -->
          <div v-if="detailLoading && !detail.rounds.length" class="rounds-loading">
            <div v-for="i in 2" :key="i" class="round-card round-card-skeleton">
              <span class="skeleton-bar skeleton-round-head" />
              <span class="skeleton-bar skeleton-round-table" />
            </div>
          </div>
          <div v-else class="rounds-list">
            <section v-for="round in detail.rounds" :key="round.id" class="round-card">
              <header class="round-head">
                <div class="round-head-left">
                  <span class="round-title">第 {{ round.roundNo }} 轮</span>
                  <span class="round-period">{{ formatTime(round.openedAt) }} → {{ formatTime(round.closedAt) }}</span>
                </div>
                <div class="round-head-right">
                  <span class="round-result" :class="resultClass(round.pnl)">{{ resultLabel(round.pnl) }}</span>
                  <span class="round-pnl amount" :class="pnlClass(round.pnl)">{{ signedYuan(round.pnl) }}</span>
                  <span class="round-rate amount" :class="pnlClass(round.pnl)">{{ rateText(round.pnlRate) }}</span>
                </div>
              </header>

              <div class="round-table-wrap">
                <table class="round-table">
                  <thead>
                    <tr>
                      <th>时间</th>
                      <th>类型</th>
                      <th class="align-right">成交价</th>
                      <th>手数</th>
                      <th class="align-right">成交金额</th>
                      <th class="align-right">费用</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="t in round.trades" :key="t.id">
                      <td class="cell-date">{{ formatTime(t.tradeTime) }}</td>
                      <td>
                        <span class="trade-type" :class="isBuy(t.tradeType) ? 'type-buy' : 'type-sell'">
                          {{ tradeTypeLabel(t.tradeType) }}
                        </span>
                      </td>
                      <td class="cell-amount align-right">{{ centsToYuan(t.price) }}</td>
                      <td class="cell-lots">{{ t.lots }}手</td>
                      <td class="cell-amount align-right">{{ centsToYuan(t.amount) }}</td>
                      <td class="cell-fee align-right">{{ centsToYuan(t.fee) }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </template>

        <div v-else class="column-empty">
          <span class="panel-empty-text">选择左侧股票查看交易历史</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { QuestionCircleOutlined } from '@ant-design/icons-vue'
import { useStockHistoryStore } from '@/stores/stockHistoryStore'
import { centsToYuan } from '@/backend/functions'
import dayjs from 'dayjs'

const historyStore = useStockHistoryStore()
const { histories, historiesLoading, summary, detail, detailLoading } = storeToRefs(historyStore)

// ---------- 展示 ----------
const tradeTypeLabels: Record<string, string> = {
  open: '建仓',
  add: '加仓',
  reduce: '减仓',
  close: '清仓',
}
const tradeTypeLabel = (t: string) => tradeTypeLabels[t] || t
const isBuy = (t: string) => t === 'open' || t === 'add'

const signedYuan = (cents: number) => {
  const sign = cents > 0 ? '+' : cents < 0 ? '-' : ''
  return `${sign}¥${centsToYuan(Math.abs(cents))}`
}
const rateText = (rate: number) => {
  const sign = rate > 0 ? '+' : ''
  return `${sign}${rate.toFixed(2)}%`
}
const pnlClass = (cents: number) => (cents > 0 ? 'amount-income' : cents < 0 ? 'amount-expense' : '')
const resultLabel = (pnl: number) => (pnl > 0 ? '盈利' : pnl < 0 ? '亏损' : '平')
const resultClass = (pnl: number) => (pnl > 0 ? 'result-win' : pnl < 0 ? 'result-loss' : 'result-even')
const formatTime = (t: number) => dayjs(t * 1000).format('YYYY-MM-DD HH:mm')
const formatDate = (t: number) => dayjs(t * 1000).format('YYYY-MM-DD')

onMounted(() => {
  historyStore.loadHistories()
})
</script>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.history-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* ========== 全局汇总条 ========== */
.history-summary-global {
  flex-shrink: 0;
  margin-bottom: var(--transactions-space-lg);
}

.history-summary-title {
  font-family: var(--transactions-font-display);
  font-size: var(--transactions-size-text-title-sm);
  font-weight: 600;
  color: var(--transactions-color-text-major);
  line-height: var(--transactions-height-snug);
  white-space: nowrap;
}

/* ========== 两栏主体（左集合 + 右明细） ========== */
.history-body {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 280px minmax(0, 1fr);
  overflow: hidden;
  background-color: var(--transactions-color-major-background);
  border: 1px solid var(--transactions-color-window-border);
  border-radius: var(--transactions-radius-lg);
}

.history-left {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  padding: var(--transactions-space-md);
  background-color: var(--transactions-color-minor-background);
  border-right: 1px solid var(--transactions-color-divider);
}

.history-center {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  padding: var(--transactions-space-lg);
  gap: var(--transactions-space-lg);
}

.panel-empty-text {
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
}

.column-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--transactions-space-xl);
}

/* ========== 左栏头部 ========== */
.history-left-head {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-sm);
  flex-shrink: 0;
  padding: var(--transactions-space-2xs) var(--transactions-space-sm)
    var(--transactions-space-md);
}

.history-left-title {
  font-size: var(--transactions-size-text-caption);
  font-weight: 500;
  letter-spacing: 0.04em;
  color: var(--transactions-color-text-secondary);
}

/* ========== 左栏：股票卡片 ========== */
.history-cards {
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

.history-card {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-2xs);
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  min-height: 76px;
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
  contain-intrinsic-size: auto 76px;
}

.history-card:hover {
  box-shadow: var(--transactions-shadow-sm);
  transform: translateX(2px);
}

.history-card.active {
  background-color: var(--transactions-color-active-bg);
  box-shadow: var(--transactions-shadow-sm);
}

.history-card.active:hover {
  box-shadow: var(--transactions-shadow-md);
}

.history-card:focus-visible {
  outline: 2px solid var(--transactions-color-primary);
  outline-offset: 2px;
  box-shadow: var(--transactions-shadow-md);
}

.history-card-name {
  font-size: var(--transactions-size-text-body-sm);
  font-weight: 500;
  color: var(--transactions-color-text-major);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.history-card-code {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
}

.history-card-meta {
  margin-top: auto;
  font-size: var(--transactions-size-text-small);
  color: var(--transactions-color-text-disabled);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 左栏骨架 */
.history-card-skeleton {
  cursor: default;
  pointer-events: none;
  justify-content: center;
  gap: var(--transactions-space-md);
}

.history-card-skeleton:hover {
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
  width: 55%;
  height: 14px;
}

.skeleton-code {
  width: 70%;
  height: 12px;
}

@keyframes skeleton-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.45; }
}

/* ========== 右栏：全空态 ========== */
.history-empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--transactions-space-sm);
  text-align: center;
  max-width: 420px;
}

.history-empty-title {
  font-size: var(--transactions-size-text-section);
  font-weight: 500;
  color: var(--transactions-color-text-major);
}

.history-empty-head {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-sm);
}

.history-empty-tip {
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-tertiary);
  cursor: help;
  transition: color var(--transactions-transition-fast);
}

.history-empty-tip:hover {
  color: var(--transactions-color-text-secondary);
}

/* ========== 右栏：汇总条 ========== */
.history-summary {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: var(--transactions-space-xl);
  padding: var(--transactions-space-lg) var(--transactions-space-xl);
  background-color: var(--transactions-color-major-background);
  border: 1px solid var(--transactions-color-window-border);
  border-radius: var(--transactions-radius-lg);
  box-shadow: var(--transactions-shadow-sm);
}

.history-summary-identity {
  display: flex;
  align-items: baseline;
  gap: var(--transactions-space-sm);
  min-width: 0;
  flex-shrink: 0;
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

.history-summary-stats {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-2xl);
  margin-left: auto;
}

.summary-stat {
  display: flex;
  align-items: baseline;
  gap: var(--transactions-space-sm);
  white-space: nowrap;
}

.summary-stat-label {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
  white-space: nowrap;
}

.summary-stat-value {
  font-size: var(--transactions-size-text-body);
  font-weight: 500;
  color: var(--transactions-color-text-major);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}

.summary-stat-total-value {
  font-size: var(--transactions-size-text-title);
  font-weight: 600;
  letter-spacing: -0.02em;
}

.summary-stat-divider {
  margin: 0 var(--transactions-space-2xs);
  color: var(--transactions-color-text-disabled);
}

/* ========== 右栏：轮次卡片 ========== */
.rounds-list,
.rounds-loading {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-lg);
  padding-right: var(--transactions-space-2xs);
  @include custom-scrollbar;
}

.round-card {
  flex-shrink: 0;
  background-color: var(--transactions-color-major-background);
  border: 1px solid var(--transactions-color-window-border);
  border-radius: var(--transactions-radius-lg);
  box-shadow: var(--transactions-shadow-sm);
  overflow: hidden;
}

.round-head {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-lg);
  padding: var(--transactions-space-md) var(--transactions-space-lg);
  border-bottom: 1px solid var(--transactions-color-divider);
  background-color: var(--transactions-color-minor-background);
}

.round-head-left {
  display: flex;
  align-items: baseline;
  gap: var(--transactions-space-md);
  min-width: 0;
}

.round-title {
  font-size: var(--transactions-size-text-section);
  font-weight: 500;
  color: var(--transactions-color-text-major);
  white-space: nowrap;
}

.round-period {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.round-head-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: var(--transactions-space-md);
  flex-shrink: 0;
}

.round-result {
  padding: var(--transactions-space-2xs) var(--transactions-space-sm);
  font-size: var(--transactions-size-text-caption);
  font-weight: 500;
  border-radius: var(--transactions-radius-sm);
}

.result-win {
  background-color: var(--transactions-color-income-tint);
  color: var(--transactions-color-income);
}

.result-loss {
  background-color: var(--transactions-color-expense-tint);
  color: var(--transactions-color-expense);
}

.result-even {
  background-color: var(--transactions-color-minor-background);
  color: var(--transactions-color-text-secondary);
}

.round-pnl {
  font-size: var(--transactions-size-text-body);
  font-weight: 600;
}

.round-rate {
  font-size: var(--transactions-size-text-body-sm);
}

/* 轮次内交易表 */
.round-table-wrap {
  overflow-x: auto;
  @include custom-scrollbar;
}

.round-table {
  width: 100%;
  min-width: 640px;
  border-collapse: collapse;
}

.round-table th {
  padding: var(--transactions-space-sm) var(--transactions-space-lg);
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-caption);
  font-weight: 500;
  color: var(--transactions-color-text-secondary);
  text-align: left;
  white-space: nowrap;
  border-bottom: 1px solid var(--transactions-color-divider);
}

.round-table td {
  padding: var(--transactions-space-sm) var(--transactions-space-lg);
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-major);
  border-bottom: 1px solid var(--transactions-color-divider);
  white-space: nowrap;
}

.round-table tbody tr:last-child td {
  border-bottom: none;
}

.round-table tbody tr:hover td {
  background-color: var(--transactions-color-hover-bg);
}

.align-right {
  text-align: right;
}

.cell-date {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  font-variant-numeric: tabular-nums;
}

.cell-amount {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-body);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
}

.cell-lots {
  color: var(--transactions-color-text-secondary);
  text-align: center;
}

.cell-fee {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-tertiary);
  font-variant-numeric: tabular-nums;
}

.trade-type {
  display: inline-block;
  padding: var(--transactions-space-2xs) var(--transactions-space-sm);
  font-size: var(--transactions-size-text-caption);
  border-radius: var(--transactions-radius-sm);
}

.type-buy {
  background-color: var(--transactions-color-expense-tint);
  color: var(--transactions-color-expense);
}

.type-sell {
  background-color: var(--transactions-color-income-tint);
  color: var(--transactions-color-income);
}

/* 轮次骨架 */
.round-card-skeleton {
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-lg);
  padding: var(--transactions-space-lg);
}

.skeleton-round-head {
  width: 40%;
  height: 20px;
}

.skeleton-round-table {
  width: 100%;
  height: 120px;
}

@media (max-width: 1080px) {
  .history-body {
    grid-template-columns: minmax(0, 1fr);
    overflow: visible;
  }

  .history-left {
    border-right: none;
    border-bottom: 1px solid var(--transactions-color-divider);
    max-height: 240px;
  }

  .history-summary {
    flex-wrap: wrap;
  }

  .history-summary-stats {
    margin-left: 0;
    flex-wrap: wrap;
    gap: var(--transactions-space-lg) var(--transactions-space-xl);
  }
}

@media (prefers-reduced-motion: reduce) {
  .history-card {
    transition: none;
  }

  .history-card:hover {
    transform: none;
  }

  .skeleton-bar {
    animation: none;
    opacity: 0.6;
  }
}
</style>
