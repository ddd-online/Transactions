<template>
  <div class="page-header">
    <span class="page-header-title">{{ title }}</span>
    <div v-if="$slots.extra" class="page-header-extra">
      <slot name="extra" />
    </div>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  title: string
}>()
</script>

<style scoped>
.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
  margin-bottom: var(--billadm-space-md);
}

.page-header-title {
  font-size: var(--billadm-size-text-title-sm);
  font-weight: 600;
  color: var(--billadm-color-text-major);
  margin: 0;
}

.page-header-extra {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
}
</style>
