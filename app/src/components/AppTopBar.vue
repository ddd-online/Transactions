<template>
  <div class="menu-bar">
    <div class="menu-bar-left">
      <span class="app-title">Transactions</span>
    </div>
    <div class="menu-bar-center">
      <span class="page-title">{{ currentPageTitle }}</span>
    </div>
    <div class="menu-bar-right">
      <a-button type="text" class="window-btn" @click="onMinimize">
        <template #icon>
          <LineOutlined />
        </template>
      </a-button>
      <a-button type="text" class="window-btn" @click="onMaximize">
        <template #icon>
          <BorderOutlined />
        </template>
      </a-button>
      <a-button class="window-btn close-btn" type="text" @click="onClose">
        <template #icon>
          <CloseOutlined />
        </template>
      </a-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { BorderOutlined, CloseOutlined, LineOutlined } from "@ant-design/icons-vue";
import { useRoute } from "vue-router";

const route = useRoute();

const currentPageTitle = computed(() => {
  const name = route.name as string | undefined;
  if (!name) return '';
  return name;
});

const onMinimize = () => {
  window.electronAPI.minimizeWindow();
}

const onMaximize = () => {
  window.electronAPI.maximizeWindow();
}

const onClose = () => {
  window.electronAPI.closeWindow();
}
</script>

<style scoped>
.menu-bar {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  width: 100%;
  padding: 0 12px;
  background-color: var(--billadm-color-elevated);
}

.menu-bar-left,
.menu-bar-center,
.menu-bar-right {
  -webkit-app-region: drag;
  pointer-events: auto;
}

.menu-bar-right>* {
  -webkit-app-region: no-drag;
}

.menu-bar-left {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-start;
}

.app-title {
  font-family: var(--billadm-font-display);
  font-size: var(--billadm-size-text-section);
  font-weight: 600;
  color: var(--billadm-color-primary);
  margin: 0;
  letter-spacing: -0.02em;
}

.menu-bar-center {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
}

.page-title {
  font-family: var(--billadm-font-display);
  font-size: var(--billadm-size-text-body);
  font-weight: 500;
  color: var(--billadm-color-text-secondary);
  margin: 0;
  letter-spacing: 0;
}

.menu-bar-right {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  justify-content: flex-end;
}

.window-btn {
  width: 32px;
  height: 32px;
  border-radius: var(--billadm-radius-md);
  color: var(--billadm-color-icon);
  transition: all var(--billadm-transition-fast);
}

.window-btn:hover {
  background-color: var(--billadm-color-hover-bg);
  color: var(--billadm-color-primary);
}

.close-btn:hover {
  background-color: rgba(199, 62, 58, 0.1);
  color: var(--billadm-color-expense);
}
</style>
