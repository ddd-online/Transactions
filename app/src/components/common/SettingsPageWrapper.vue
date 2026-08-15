<template>
  <div class="settings-page-wrapper">
    <TransactionsPageHeader :title="title">
      <template v-if="$slots.extra" #extra>
        <slot name="extra" />
      </template>
    </TransactionsPageHeader>
    <div class="page-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import TransactionsPageHeader from '@/components/common/TransactionsPageHeader.vue'

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
  padding: var(--transactions-space-xl) var(--transactions-space-lg) 0;

  --settings-card-gap: var(--transactions-space-sm);
  --settings-section-gap: var(--transactions-space-xl);
}

.page-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: var(--transactions-space-sm);
  min-height: 0;
  padding-bottom: var(--transactions-space-xl);

  @include custom-scrollbar;
}
</style>
