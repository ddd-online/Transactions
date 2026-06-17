<template>
  <div class="settings-view">
    <!-- 左侧设置导航 -->
    <aside class="settings-sidebar">
      <nav class="settings-nav" aria-label="设置导航">
        <button
          class="nav-item"
          :class="{ active: activeComponent === 'workspace' }"
          @click="activeComponent = 'workspace'"
          aria-label="工作空间"
        >
          <FolderOpenOutlined class="nav-icon"/>
          <span class="nav-text">工作空间</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeComponent === 'template' }"
          @click="activeComponent = 'template'"
          aria-label="消费模板"
        >
          <FileTextOutlined class="nav-icon"/>
          <span class="nav-text">消费模板</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeComponent === 'about' }"
          @click="activeComponent = 'about'"
          aria-label="关于"
        >
          <InfoCircleOutlined class="nav-icon"/>
          <span class="nav-text">关于</span>
        </button>
      </nav>
    </aside>

    <!-- 右侧内容区 -->
    <main class="settings-content">
      <div class="content-inner">
        <component :is="currentComponent" />
      </div>
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import {
  FolderOpenOutlined,
  FileTextOutlined,
  InfoCircleOutlined
} from "@ant-design/icons-vue";
import WorkspaceSetting from './WorkspaceSetting.vue';
import BilladmTemplateSetting from './BilladmTemplateSetting.vue';
import AboutSetting from './AboutSetting.vue';

const activeComponent = ref('workspace');

const componentMap = {
  'workspace': WorkspaceSetting,
  'template': BilladmTemplateSetting,
  'about': AboutSetting,
};

const currentComponent = computed(() => {
  return componentMap[activeComponent.value as keyof typeof componentMap] || null;
});
</script>

<style scoped>
.settings-view {
  height: 100%;
  display: flex;
  background-color: var(--billadm-color-major-warm);
}

/* Sidebar */
.settings-sidebar {
  width: 200px;
  flex-shrink: 0;
  background-color: var(--billadm-color-major-warm);
  border-right: 1px solid var(--billadm-color-divider);
  display: flex;
  flex-direction: column;
}

.settings-nav {
  display: flex;
  flex-direction: column;
  padding: var(--billadm-space-sm);
  gap: 2px;
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  border-radius: var(--billadm-radius-md);
  border: none;
  background: none;
  cursor: pointer;
  text-align: left;
  font-family: inherit;
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-secondary);
  width: 100%;
  transition: all var(--billadm-transition-fast);
}

.nav-item:hover {
  background-color: var(--billadm-color-hover-bg);
  color: var(--billadm-color-text-major);
}

.nav-item.active {
  background-color: var(--billadm-color-active-bg);
  color: var(--billadm-color-primary);
  font-weight: 500;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: 16px;
}

.nav-text {
  white-space: nowrap;
}

/* Content */
.settings-content {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  background-color: var(--billadm-color-major-warm);
}

.content-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--billadm-space-md) var(--billadm-space-lg);
}
</style>
