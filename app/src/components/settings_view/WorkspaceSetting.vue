<template>
  <div class="workspace-setting">
    <!-- 页面标题 -->
    <div class="setting-header">
      <span class="setting-title">工作空间</span>
    </div>

    <!-- 主要工作空间卡片 -->
    <div class="workspace-hero">
      <div class="hero-content">
        <div class="hero-icon">
          <FolderOpenOutlined />
        </div>
        <div class="hero-text">
          <h2 class="hero-title">当前工作空间</h2>
          <p class="hero-path" :class="{ empty: !workspaceDir }">
            <span v-if="workspaceDir">{{ workspaceDir }}</span>
            <span v-else class="path-placeholder">未设置工作空间</span>
          </p>
        </div>
      </div>
      <div class="hero-action">
        <a-button type="primary" size="large" @click="showFileSelect = true">
          <template #icon>
            <SwapOutlined />
          </template>
          切换工作空间
        </a-button>
      </div>
    </div>

    <!-- 工作空间选择弹窗 -->
    <billadm-file-select
      v-model="showFileSelect"
      title="选择工作目录"
      placeholder="请输入或选择工作目录路径"
      @confirm="handleSwitchWorkspace"
    />
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import {
  FolderOpenOutlined,
  SwapOutlined
} from "@ant-design/icons-vue";
import { useLedgerStore } from '@/stores/ledgerStore';
import { openWorkspace } from '@/backend/api/workspace';
import NotificationUtil from '@/backend/notification';

const ledgerStore = useLedgerStore();
const showFileSelect = ref(false);
const workspaceDir = ref('');

onMounted(async () => {
  workspaceDir.value = await window.electronAPI.getWorkspace() || '';
});

const handleSwitchWorkspace = async (newWorkspaceDir: string) => {
  try {
    await openWorkspace(newWorkspaceDir);
    window.electronAPI.setWorkspace(newWorkspaceDir);
    workspaceDir.value = newWorkspaceDir;
    await ledgerStore.init();
    NotificationUtil.success('切换工作空间成功');
  } catch (error) {
    NotificationUtil.error('切换工作空间失败', `${error}`);
  }
};
</script>

<style scoped>
.workspace-setting {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-lg);
}

/* Page Header */
.setting-header {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  padding-bottom: var(--billadm-space-sm);
}

.setting-title {
  font-size: var(--billadm-size-text-title-sm);
  font-weight: 600;
  color: var(--billadm-color-text-major);
  margin: 0;
}

/* Hero Section */
.workspace-hero {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--billadm-space-lg);
  padding: var(--billadm-space-lg);
  background-color: var(--billadm-color-major-background);
  border-radius: var(--billadm-radius-lg);
  border: 1px solid var(--billadm-color-divider);
}

.hero-content {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-md);
}

.hero-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  background-color: var(--billadm-color-primary);
  border-radius: var(--billadm-radius-md);
  color: var(--billadm-color-text-inverse);
  font-size: 20px;
  flex-shrink: 0;
}

.hero-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.hero-title {
  font-size: var(--billadm-size-text-body-sm);
  font-weight: 500;
  color: var(--billadm-color-text-secondary);
  margin: 0;
}

.hero-path {
  font-size: var(--billadm-size-text-body);
  font-family: var(--billadm-font-mono);
  color: var(--billadm-color-text-major);
  margin: 0;
  max-width: 400px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hero-path.empty {
  color: var(--billadm-color-text-disabled);
  font-style: italic;
}


</style>
