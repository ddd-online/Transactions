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
  margin-right: calc(3 * 32px + 2 * 6px); /* 为窗口控制按钮 (3个32px按钮 + 2个6px间隙 = 108px) 留出空间，避免拖拽区域覆盖按钮 */
  border-bottom: 1px solid var(--billadm-color-divider);
  -webkit-app-region: drag;
}

.page-toolbar :deep(*) {
  -webkit-app-region: no-drag;
}

.page-content {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
</style>
