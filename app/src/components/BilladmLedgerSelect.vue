<template>
  <a-select @change="handleChange" class="ledger-select" style="width: 150px" :value="ledgerStore.currentLedgerName">
    <a-select-option
        v-for="option in options"
        :key="option.value"
        :value="option.value">
      {{ option.label }}
    </a-select-option>
  </a-select>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {useLedgerStore} from '@/stores/ledgerStore.ts';
import type {Ledger} from '@/types/billadm';
import type {SelectValue} from "ant-design-vue/es/select";
import type {DefaultOptionType} from "ant-design-vue/es/vc-cascader";

const ledgerStore = useLedgerStore();

const options = computed(() => {
  if (!Array.isArray(ledgerStore.ledgers)) return [];
  return ledgerStore.ledgers.map((ledger: Ledger) => ({
    label: ledger.name,
    value: ledger.id,
  }));
});

const handleChange = (value: SelectValue, _: DefaultOptionType | DefaultOptionType[]) => {
  ledgerStore.setCurrentLedger(value as string);
};
</script>

<style scoped>
.ledger-select :deep(.ant-select-selector) {
  background-color: var(--billadm-color-primary);
  border-color: var(--billadm-color-primary);
  color: var(--billadm-color-text-inverse);
}

.ledger-select :deep(.ant-select-arrow) {
  color: var(--billadm-color-text-inverse);
}

.ledger-select :deep(.ant-select-selection-item) {
  color: var(--billadm-color-text-inverse);
}

.ledger-select :deep(.ant-select:not(.ant-select-disabled):hover .ant-select-selector) {
  background-color: var(--billadm-color-primary-light);
  border-color: var(--billadm-color-primary-light);
}

.ledger-select :deep(.ant-select-focused .ant-select-selector) {
  background-color: var(--billadm-color-primary);
  border-color: var(--billadm-color-primary) !important;
  box-shadow: 0 0 0 2px rgba(74, 140, 111, 0.2) !important;
}
</style>
