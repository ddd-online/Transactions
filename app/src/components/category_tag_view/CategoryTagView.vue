<template>
  <div class="category-tag-view">
    <BilladmCategoryTagSetting />
  </div>
</template>

<script setup lang="ts">
import BilladmCategoryTagSetting from '@/components/settings_view/BilladmCategoryTagSetting.vue'
</script>

<style scoped>
.category-tag-view {
  height: 100%;
  overflow-y: auto;
  padding: var(--billadm-space-md) var(--billadm-space-lg);
  background: var(--billadm-color-major-background);
}
</style>
