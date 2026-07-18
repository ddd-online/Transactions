<template>
  <div class="settings-page-wrapper">
    <BilladmPageHeader :title="title">
      <template v-if="$slots.extra" #extra>
        <slot name="extra" />
      </template>
    </BilladmPageHeader>
    <div class="page-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import BilladmPageHeader from '@/components/common/BilladmPageHeader.vue'

defineProps<{
  title: string
}>()
</script>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.settings-page-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--billadm-space-xl) var(--billadm-space-lg) 0;

  --settings-card-gap: var(--billadm-space-sm);
  --settings-section-gap: var(--billadm-space-xl);
}

.page-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-sm);
  min-height: 0;
  padding-bottom: var(--billadm-space-xl);

  @include custom-scrollbar;
}
</style>
