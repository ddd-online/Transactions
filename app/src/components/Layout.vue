<template>
  <div class="app-shell">
    <!-- 工作空间选择弹窗 -->
    <billadm-file-select v-model="showWorkspaceSelect" title="新建工作目录或打开已存在的工作目录" @confirm="handleOpenWorkspace" />

    <!-- 主布局 -->
    <div class="app-shell-body">
      <!-- 侧边栏 -->
      <aside class="app-sidebar">
        <app-left-bar />
      </aside>

      <!-- 内容区域 -->
      <main class="app-content">
        <!-- 沉浸式窗口控制按钮 - 浮动在右上角 -->
        <app-top-bar />
        <router-view v-slot="{ Component }">
          <Transition name="page-fade" mode="out-in">
            <div class="app-router-view" :key="$route.path">
              <component :is="Component" />
            </div>
          </Transition>
        </router-view>
        <footer v-if="showBottomBar" class="app-footer">
          <app-bottom-bar />
        </footer>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref, computed } from "vue";
import { useRoute } from "vue-router";
import { useLedgerStore } from "@/stores/ledgerStore.ts";
import { openWorkspace } from "@/backend/api/workspace.ts";
import NotificationUtil from "@/backend/notification.ts";

const route = useRoute();
const ledgerStore = useLedgerStore();
const showWorkspaceSelect = ref(false);
const showBottomBar = computed(() => route.path === '/tr_view' || route.path === '/da_view' || route.path === '/key_event_view');

const handleOpenWorkspace = async (workspaceDir: string) => {
  try {
    await openWorkspace(workspaceDir);
    window.electronAPI.setWorkspace(workspaceDir);
    await ledgerStore.init();
    showWorkspaceSelect.value = false;
  } catch (error) {
    NotificationUtil.error('打开工作空间失败', `${error}`);
    showWorkspaceSelect.value = true;
  }
}

const initWorkspace = async () => {
  const workspaceDir = await window.electronAPI.getWorkspace();
  if (!workspaceDir) {
    showWorkspaceSelect.value = true;
    return;
  }
  try {
    await openWorkspace(workspaceDir);
    showWorkspaceSelect.value = false;
    await ledgerStore.init();
  } catch (error) {
    NotificationUtil.error('打开工作空间失败', `${error}`);
    showWorkspaceSelect.value = true;
  }
}

onMounted(initWorkspace);
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--billadm-color-major-background);
  user-select: none;
  -webkit-user-select: none;
}

.app-shell-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* 侧边栏 */
.app-sidebar {
  width: 200px;
  min-width: 200px;
  height: 100%;
  background-color: var(--billadm-color-minor-background);
  flex-shrink: 0;
  border-right: 1px solid var(--billadm-color-divider);
  display: flex;
  flex-direction: column;
}

/* 内容区域 */
.app-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  background-color: var(--billadm-color-major-warm);
  overflow: hidden;
  position: relative;
}

.app-router-view {
  flex: 1;
  overflow: auto;
}

/* 页面过渡 */
.page-fade-enter-active,
.page-fade-leave-active {
  transition: opacity 180ms ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}

/* 底部状态栏 */
.app-footer {
  height: var(--billadm-size-footer-height);
  background-color: var(--billadm-color-major-warm);
  flex-shrink: 0;
  border-top: 1px solid var(--billadm-color-divider);
}
</style>
