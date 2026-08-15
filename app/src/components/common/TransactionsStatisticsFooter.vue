<template>
  <div class="statistics-footer">
    <div class="statistics-footer-item">
      <span class="statistics-footer-item-label">收入</span>
      <span class="statistics-footer-item-value income">
        {{ centsToYuan(income) }}
      </span>
    </div>
    <div class="statistics-footer-divider"></div>
    <div class="statistics-footer-item">
      <span class="statistics-footer-item-label">支出</span>
      <span class="statistics-footer-item-value expense">
        {{ centsToYuan(expense) }}
      </span>
    </div>
    <div class="statistics-footer-divider"></div>
    <div class="statistics-footer-item">
      <span class="statistics-footer-item-label">转账</span>
      <span class="statistics-footer-item-value transfer">
        {{ centsToYuan(transfer) }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {centsToYuan} from "@/backend/functions.ts";
import {useAppDataStore} from "@/stores/appDataStore.ts";

const appDataStore = useAppDataStore();

interface Props {
  income?: number
  expense?: number
  transfer?: number
}

const props = defineProps<Props>()

const hasProps = computed(() => props.income !== undefined || props.expense !== undefined || props.transfer !== undefined)

const income = computed(() => hasProps.value ? (props.income ?? 0) : appDataStore.income)
const expense = computed(() => hasProps.value ? (props.expense ?? 0) : appDataStore.expense)
const transfer = computed(() => hasProps.value ? (props.transfer ?? 0) : appDataStore.transfer)
</script>

<style scoped>
.statistics-footer {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: var(--transactions-space-2xl);
}

.statistics-footer-item {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-md);
}

.statistics-footer-item-label {
  font-family: var(--transactions-font-body);
  font-size: var(--transactions-size-text-caption);
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--transactions-color-text-secondary);
  margin: 0;
}

.statistics-footer-item-value {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-body);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.01em;
  margin: 0;
}

.statistics-footer-item-value.income {
  color: var(--transactions-color-income);
}

.statistics-footer-item-value.expense {
  color: var(--transactions-color-expense);
}

.statistics-footer-item-value.transfer {
  color: var(--transactions-color-transfer);
}

.statistics-footer-divider {
  width: 1px;
  height: 16px;
  background-color: var(--transactions-color-window-border);
}
</style>
