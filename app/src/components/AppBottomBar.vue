<template>
  <div class="bottom-bar">
    <div class="bottom-bar-left">
      <div v-if="updateStore.status === 'downloading'" class="download-progress">
        <a-progress
          :percent="updateStore.downloadPercent"
          :show-info="false"
          size="small"
          stroke-color="var(--transactions-color-primary)"
          trail-color="var(--transactions-color-divider)"
          style="width: 160px"
        />
        <span class="download-text">
          {{ updateStore.downloadPercent }}% · {{ updateStore.downloadSpeed }}
        </span>
      </div>
    </div>
    <div class="bottom-bar-right">
      <transactions-statistics-footer v-if="showStatistics" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUpdateStore } from '@/stores/updateStore'
import TransactionsStatisticsFooter from '@/components/common/TransactionsStatisticsFooter.vue'

const route = useRoute()
const updateStore = useUpdateStore()

const showStatistics = computed(() => {
  return route.path === '/tr_view' || route.path === '/da_view' || route.path === '/key_event_view'
})
</script>

<style scoped>
.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  width: 100%;
  padding: 0 16px;
}

.bottom-bar > * {
  -webkit-app-region: no-drag;
}

.bottom-bar-left {
  display: flex;
  align-items: center;
}

.bottom-bar-right {
  display: flex;
  align-items: center;
}

.download-progress {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-md);
}

.download-text {
  font-family: var(--transactions-font-mono);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
</style>
