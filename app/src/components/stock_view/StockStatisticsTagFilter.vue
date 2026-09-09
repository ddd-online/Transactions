<template>
  <a-select
    :value="value"
    class="stats-tag-filter-select"
    @change="emit('change', $event)"
    aria-label="按交易标签筛选"
  >
    <a-select-option value="">全部标签</a-select-option>
    <a-select-option v-for="tag in tagOptions" :key="tag" :value="tag">
      {{ tag }}
    </a-select-option>
  </a-select>
</template>

<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useStockTagStore } from '@/stores/stockTagStore'
import type { StockTradeTag } from '@/types/transactions'

defineProps<{
  value: StockTradeTag | ''
}>()

const emit = defineEmits<{
  (e: 'change', value: unknown): void
}>()

const stockTagStore = useStockTagStore()
const { tags } = storeToRefs(stockTagStore)
const tagOptions = computed(() => tags.value)

onMounted(() => {
  stockTagStore.load()
})
</script>

<style scoped lang="scss">
.stats-tag-filter-select {
  width: 128px;
}
</style>
