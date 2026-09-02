<template>
  <a-modal
    :open="open"
    :title="editTitle"
    ok-text="保存修改"
    cancel-text="取消"
    centered
    :width="440"
    :confirm-loading="saving"
    @ok="handleSubmit"
    @cancel="emit('update:open', false)"
  >
    <template v-if="trade">
      <div class="edit-summary">
        <span class="edit-summary-name">{{ trade.stockName }}</span>
        <span class="edit-summary-code amount">{{ trade.stockCode }}</span>
        <span class="edit-summary-type" :class="isBuy(trade.tradeType) ? 'type-buy' : 'type-sell'">
          {{ tradeTypeLabel(trade.tradeType) }}
        </span>
      </div>
      <a-form layout="vertical">
        <div class="edit-form-row">
          <a-form-item label="成交价（元/股）" required>
            <a-input v-model:value="form.price" placeholder="如 12.50" />
          </a-form-item>
          <a-form-item label="手数" required>
            <a-input v-model:value="form.lots" placeholder="如 10" />
          </a-form-item>
        </div>
        <a-form-item label="成交时间" required>
          <a-date-picker v-model:value="form.tradeTime" style="width: 100%" />
        </a-form-item>
      </a-form>
      <p class="edit-hint">保存后会按修改后的时间/价格/手数重算持仓成本、盈亏、资金记录与交易历史归档。</p>
    </template>
  </a-modal>
</template>

<script setup lang="ts">
import { computed, reactive, watch } from 'vue'
import { message } from 'ant-design-vue'
import type { Dayjs } from 'dayjs'
import dayjs from 'dayjs'
import { centsToYuan } from '@/backend/functions'
import type { StockTrade } from '@/types/transactions'

const props = withDefaults(defineProps<{
  open: boolean
  trade: StockTrade | null
  saving?: boolean
}>(), {
  saving: false,
})

const emit = defineEmits<{
  (e: 'update:open', value: boolean): void
  (e: 'save', payload: { tradeId: string; price: number; lots: number; tradeTime: number }): void
}>()

const form = reactive({
  price: '',
  lots: '',
  tradeTime: dayjs() as Dayjs,
})

const tradeTypeLabels: Record<string, string> = {
  open: '建仓',
  add: '加仓',
  reduce: '减仓',
  close: '清仓',
}
const tradeTypeLabel = (type: string): string => tradeTypeLabels[type] || type
const isBuy = (type: string): boolean => type === 'open' || type === 'add'

const editTitle = computed(() =>
  props.trade ? `修改交易 · ${tradeTypeLabel(props.trade.tradeType)}` : '修改交易'
)

watch(
  () => props.open,
  (open) => {
    if (!open || !props.trade) return
    form.price = String(parseFloat(centsToYuan(props.trade.price)))
    form.lots = String(props.trade.lots)
    form.tradeTime = dayjs(props.trade.tradeTime * 1000)
  }
)

const handleSubmit = () => {
  if (!props.trade) return
  const price = parseFloat(form.price)
  const lots = parseInt(form.lots, 10)
  if (isNaN(price) || price <= 0) {
    message.error('请输入有效的成交价')
    return
  }
  if (isNaN(lots) || lots <= 0) {
    message.error('请输入有效手数')
    return
  }
  emit('save', {
    tradeId: props.trade.id,
    price,
    lots,
    tradeTime: form.tradeTime.unix(),
  })
}
</script>

<style scoped>
.edit-summary {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-sm);
  margin-bottom: var(--transactions-space-lg);
  padding-bottom: var(--transactions-space-md);
  border-bottom: 1px solid var(--transactions-color-divider);
}

.edit-summary-name {
  font-size: var(--transactions-size-text-body);
  font-weight: 500;
  color: var(--transactions-color-text-major);
}

.edit-summary-code {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-tertiary);
}

.edit-summary-type {
  margin-left: auto;
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

.edit-form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--transactions-space-md);
}

.edit-hint {
  margin: 0;
  font-size: var(--transactions-size-text-caption);
  line-height: var(--transactions-height-normal);
  color: var(--transactions-color-text-tertiary);
}
</style>
