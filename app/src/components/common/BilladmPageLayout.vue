<template>
  <div class="page-layout">
    <div v-if="$slots.toolbar" class="page-toolbar">
      <slot name="toolbar" />
    </div>
    <div class="page-content">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.page-layout {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: var(--billadm-space-md) var(--billadm-space-lg);
  gap: var(--billadm-space-md);
}

.page-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  padding-bottom: var(--billadm-space-md);
  border-bottom: 1px solid var(--billadm-color-divider);
}

.page-content {
  flex: 1;
  overflow: auto;
}
</style>
