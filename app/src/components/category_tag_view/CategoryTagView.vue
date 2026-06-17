<template>
  <BilladmPageLayout>
    <template #toolbar>
      <nav class="type-nav">
        <button v-for="type in transactionTypes" :key="type.value" class="type-pill"
          :class="{ 'is-active': activeType === type.value }" :style="{ '--c': type.color }"
          @click="activeType = type.value">
          <span class="pill-dot"></span>
          {{ type.label }}
        </button>
      </nav>
    </template>
    <BilladmCategoryTagSetting :active-type="activeType" @update:active-type="activeType = $event" />
  </BilladmPageLayout>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import BilladmCategoryTagSetting from '@/components/settings_view/BilladmCategoryTagSetting.vue'
import { TransactionTypeToColor } from "@/backend/constant"
import type { TransactionType } from '@/types/billadm'

const transactionTypes = [
  { value: 'expense' as TransactionType, label: '支出', color: TransactionTypeToColor.get('expense') || '#D9705A' },
  { value: 'income' as TransactionType, label: '收入', color: TransactionTypeToColor.get('income') || '#3D8C5E' },
  { value: 'transfer' as TransactionType, label: '转账', color: TransactionTypeToColor.get('transfer') || '#5C8DB5' },
]

const activeType = ref<TransactionType>('expense')
</script>

<style scoped>
.type-nav {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-xs);
}

.type-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 12px;
  font-size: var(--billadm-size-text-body-sm);
  font-weight: 500;
  color: var(--billadm-color-text-secondary);
  background: transparent;
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-full);
  cursor: pointer;
  transition: all var(--billadm-transition-fast);
}

.type-pill:hover:not(.is-active) {
  color: var(--billadm-color-text-major);
  border-color: var(--billadm-color-text-disabled);
}

.type-pill.is-active {
  color: var(--c);
  border-color: var(--c);
  background-color: color-mix(in srgb, var(--c) 8%, transparent);
}

.pill-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}
</style>
