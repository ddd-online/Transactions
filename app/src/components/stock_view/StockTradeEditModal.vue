<template>
  <a-modal
    v-model:open="visible"
    title="编辑成交"
    :width="520"
    :ok-text="saving ? '保存中' : '保存'"
    cancel-text="取消"
    :confirm-loading="saving"
    centered
    @ok="handleSave"
  >
    <template v-if="current">
      <div class="edit-head">
        <span class="edit-stock">{{ current.stockName }}</span>
        <span class="edit-code">{{ current.stockCode }}</span>
        <a-tag :class="isBuy(current.tradeType) ? 'tag-buy' : 'tag-sell'">
          {{ tradeTypeLabel(current.tradeType) }}
        </a-tag>
        <span class="edit-order-meta">共 {{ siblings.length }} 笔成交</span>
      </div>

      <div class="edit-fills">
        <div
          v-for="item in siblings"
          :key="item.id"
          class="edit-fill-row"
          :class="{ 'edit-fill-row--active': item.id === current.id }"
        >
          <span class="edit-fill-tag">{{ item.id === current.id ? '本笔' : `第 ${item.orderSeq} 笔` }}</span>
          <span class="edit-fill-price amount">¥{{ centsToYuan(item.price) }}</span>
          <span class="edit-fill-lots">{{ item.lots }}手</span>
          <span class="edit-fill-amount amount">¥{{ centsToYuan(item.amount) }}</span>
        </div>
      </div>

      <a-form layout="vertical" class="edit-form">
        <div class="edit-form-row">
          <a-form-item label="成交价（元/股）" required>
            <a-input v-model:value="form.price" />
          </a-form-item>
          <a-form-item label="手数" required>
            <a-input v-model:value="form.lots" />
          </a-form-item>
        </div>
        <a-form-item label="委托时间（同步到本委托全部成交）" required>
          <a-date-picker v-model:value="form.tradeTime" style="width: 100%" />
        </a-form-item>
      </a-form>
      <p class="edit-hint">
        保存后按当前费用设置重算本笔委托的费用，并重新计算该股持仓、资金记录与轮次。
      </p>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { h, reactive, ref } from 'vue'
import { message, Modal } from 'ant-design-vue'
import dayjs, { type Dayjs } from 'dayjs'
import { useStockPositionStore } from '@/stores/stockPositionStore'
import { centsToYuan } from '@/backend/functions'
import type { StockTrade, StockTradeImpact } from '@/types/transactions'

const emit = defineEmits<{ changed: [] }>()

const stockStore = useStockPositionStore()

const tradeTypeLabels: Record<string, string> = {
  open: '建仓',
  add: '加仓',
  reduce: '减仓',
  close: '清仓',
}
const tradeTypeLabel = (type: string) => tradeTypeLabels[type] || type
const isBuy = (type: string) => type === 'open' || type === 'add'

const visible = ref(false)
const saving = ref(false)
const current = ref<StockTrade | null>(null)
const siblings = ref<StockTrade[]>([])
const form = reactive({
  price: '',
  lots: '',
  tradeTime: dayjs() as Dayjs,
})

/** 打开编辑弹窗：trade 为被编辑的成交，orderTrades 为同一委托的全部成交明细 */
const openEdit = (trade: StockTrade, orderTrades: StockTrade[]) => {
  current.value = trade
  siblings.value = [...orderTrades].sort((a, b) => a.orderSeq - b.orderSeq)
  form.price = centsToYuan(trade.price)
  form.lots = String(trade.lots)
  form.tradeTime = dayjs(trade.tradeTime * 1000)
  visible.value = true
}

// 影响预演结果 → 二次确认弹窗（列出会失效的轮次与复盘）
const confirmImpact = (impact: StockTradeImpact, title: string, okText: string): Promise<boolean> => {
  const lost = impact.removedRounds
  const content = h('div', { style: 'line-height: 1.7' }, [
    h('p', { style: 'margin: 0' }, impact.stockName
      ? `${impact.stockName} 变动后持仓 ${Math.floor(impact.positionAfter / 100)} 手`
      : `变动后持仓 ${Math.floor(impact.positionAfter / 100)} 手`),
    h('p', { style: 'margin: 8px 0 0' }, '持仓、资金记录、轮次与统计都会按新数据重算。'),
    lost.length
      ? h('p', { style: 'margin: 8px 0 0; color: var(--transactions-color-expense)' },
          `第 ${lost.map((round) => round.roundNo).join('、')} 轮不再成立${lost.some((round) => round.hasReview) ? '，该轮复盘会一并丢失' : ''}。`)
      : h('p', { style: 'margin: 8px 0 0' }, '不会影响任何一轮的复盘。'),
  ])
  return new Promise<boolean>((resolve) => {
    Modal.confirm({
      title,
      content,
      okText,
      cancelText: '取消',
      okType: 'danger',
      centered: true,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
}

const handleSave = async () => {
  const trade = current.value
  if (!trade) return
  const price = parseFloat(form.price)
  const lots = parseInt(form.lots, 10)
  if (isNaN(price) || price <= 0) {
    message.error('请输入有效的成交价')
    return
  }
  if (isNaN(lots) || lots <= 0) {
    message.error('请输入有效的手数')
    return
  }
  const tradeTime = form.tradeTime.unix()

  saving.value = true
  try {
    const impact = await stockStore.previewTradeImpact({
      action: 'update_trade',
      tradeId: trade.id,
      price,
      lots,
      tradeTime,
    })
    if (!impact) return
    if (impact.removedRounds.length) {
      const confirmed = await confirmImpact(impact, '确认修改这笔成交？', '确认修改')
      if (!confirmed) return
    }
    const ok = await stockStore.updateTradeFill(trade.id, price, lots, tradeTime, trade.stockCode)
    if (ok) {
      visible.value = false
      emit('changed')
    }
  } finally {
    saving.value = false
  }
}

/** 删除整笔委托：orderTrades 为该委托的全部成交明细 */
const confirmDelete = async (orderTrades: StockTrade[]) => {
  if (!orderTrades.length) return
  const first = orderTrades[0]!
  const orderId = first.orderId || first.id
  const lots = orderTrades.reduce((acc, item) => acc + item.lots, 0)
  const amount = orderTrades.reduce((acc, item) => acc + item.amount, 0)

  const impact = await stockStore.previewTradeImpact({ action: 'delete_order', orderId })
  if (!impact) return
  const summary = `${first.stockName} ${tradeTypeLabel(first.tradeType)} ${lots}手 · 成交金额 ¥${centsToYuan(amount)} · 共 ${orderTrades.length} 笔成交`
  const lost = impact.removedRounds
  const content = h('div', { style: 'line-height: 1.7' }, [
    h('p', { style: 'margin: 0' }, summary),
    h('p', { style: 'margin: 8px 0 0' }, '删除后该股持仓、资金记录、轮次与统计都会重算。'),
    lost.length
      ? h('p', { style: 'margin: 8px 0 0; color: var(--transactions-color-expense)' },
          `第 ${lost.map((round) => round.roundNo).join('、')} 轮不再成立${lost.some((round) => round.hasReview) ? '，该轮复盘会一并丢失' : ''}。`)
      : h('p', { style: 'margin: 8px 0 0' }, '不会影响任何一轮的复盘。'),
  ])

  const confirmed = await new Promise<boolean>((resolve) => {
    Modal.confirm({
      title: '删除整笔委托？',
      content,
      okText: '删除',
      cancelText: '取消',
      okType: 'danger',
      centered: true,
      onOk: () => resolve(true),
      onCancel: () => resolve(false),
    })
  })
  if (!confirmed) return
  const ok = await stockStore.deleteTradeOrder(orderId, first.stockCode)
  if (ok) emit('changed')
}

defineExpose({ openEdit, confirmDelete })
</script>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.edit-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--transactions-color-border);
}

.edit-stock {
  font-weight: 600;
  color: var(--transactions-color-text-major);
}

.edit-code,
.edit-order-meta {
  font-size: 12px;
  color: var(--transactions-color-text-tertiary);
}

.edit-fills {
  margin: 12px 0;
  border: 1px solid var(--transactions-color-border);
  border-radius: 8px;
  overflow: hidden;
}

.edit-fill-row {
  display: grid;
  grid-template-columns: 64px 1fr 72px 1fr;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  font-size: 13px;
  border-bottom: 1px solid var(--transactions-color-divider);

  &:last-child {
    border-bottom: none;
  }
}

.edit-fill-row--active {
  background: var(--transactions-color-primary-tint);
}

.edit-fill-tag {
  color: var(--transactions-color-text-tertiary);
  font-size: 12px;
}

.edit-fill-lots {
  color: var(--transactions-color-text-secondary);
  text-align: right;
}

.edit-fill-amount,
.edit-fill-price {
  text-align: right;
}

.edit-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.edit-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--transactions-color-text-tertiary);
}
</style>
