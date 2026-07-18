<template>
  <div class="settings-view">
    <!-- 拖拽区域（无边框窗口的拖拽手柄，悬浮不占位） -->
    <div class="settings-drag-bar"></div>
    <!-- 左侧设置导航 -->
    <aside class="settings-sidebar">
      <nav class="settings-nav" aria-label="设置导航">
        <button
          class="nav-item"
          :class="{ active: activeComponent === 'general' }"
          @click="activeComponent = 'general'"
          aria-label="通用"
        >
          <SettingOutlined class="nav-icon"/>
          <span class="nav-text">通用</span>
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
          :class="{ active: activeComponent === 'diary' }"
          @click="activeComponent = 'diary'"
          aria-label="日记配置"
        >
          <BookOutlined class="nav-icon"/>
          <span class="nav-text">日记配置</span>
        </button>
        <button
          class="nav-item"
          :class="{ active: activeComponent === 'ai' }"
          @click="activeComponent = 'ai'"
          aria-label="智能助手"
        >
          <RobotOutlined class="nav-icon"/>
          <span class="nav-text">智能助手</span>
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
  FileTextOutlined,
  SettingOutlined,
  InfoCircleOutlined,
  RobotOutlined,
  BookOutlined,
} from "@ant-design/icons-vue";
import BilladmTemplateSetting from './BilladmTemplateSetting.vue';
import GeneralSetting from './GeneralSetting.vue';
import AboutSetting from './AboutSetting.vue';
import AiSetting from './AiSetting.vue';
import DiarySetting from './DiarySetting.vue';

const activeComponent = ref('general');

const componentMap = {
  'general': GeneralSetting,
  'template': BilladmTemplateSetting,
  'diary': DiarySetting,
  'about': AboutSetting,
  'ai': AiSetting,
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
  position: relative;
}

/* 拖拽条：悬浮于设置页面顶部，左侧避开 sidebar，右侧避开窗口控制按钮，不挤占原有布局 */
.settings-drag-bar {
  position: absolute;
  top: 0;
  left: 200px; /* 避开左侧 sidebar 宽度 */
  right: 0;
  height: 32px;
  margin-right: calc(12px + 3 * 32px + 2 * 6px); /* 避开窗口控制按钮: right:12px + 3×32px按钮 + 2×6px间隙 = 120px */
  -webkit-app-region: drag;
  z-index: 1;
}

/* Sidebar */
.settings-sidebar {
  width: 200px;
  flex-shrink: 0;
  background-color: var(--billadm-color-major-background);
  border-right: 1px solid var(--billadm-color-divider);
  display: flex;
  flex-direction: column;
}

.settings-nav {
  display: flex;
  flex-direction: column;
  padding: var(--billadm-space-sm);
  gap: var(--billadm-space-2xs);
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

.nav-item:focus-visible {
  outline: 2px solid var(--billadm-color-primary);
  outline-offset: 2px;
}

.nav-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  font-size: var(--billadm-size-text-section);
}

.nav-text {
  white-space: nowrap;
}

@media (prefers-reduced-motion: reduce) {
  .nav-item { transition: none; }
}

/* Content */
.settings-content {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background-color: var(--billadm-color-major-warm);
}

.content-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>
