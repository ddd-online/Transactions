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
}

.page-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
  padding: 0 0 var(--billadm-space-md) 0;
  margin-right: calc(3 * 32px + 2 * 6px);
  /* 为窗口控制按钮 (3个32px按钮 + 2个6px间隙 = 108px) 留出空间，避免拖拽区域覆盖按钮 */
  -webkit-app-region: drag;
}

.page-toolbar :deep(*) {
  -webkit-app-region: no-drag;
}

/* 工具栏内交互元素统一 32px 高度 */
.page-toolbar :deep(.ant-btn),
.page-toolbar :deep(.ant-picker),
.page-toolbar :deep(.ant-segmented) {
  height: 32px;
}

.page-content {
  flex: 1;
  overflow: auto;
  display: flex;
  flex-direction: column;
}
</style>
