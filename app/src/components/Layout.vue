<template>
  <div class="app-shell">
    <!-- 工作空间选择弹窗 -->
    <transactions-file-select v-model="showWorkspaceSelect" title="新建或打开工作目录" @confirm="handleOpenWorkspace" />

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
            <div class="app-router-view" :key="routerViewKey">
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
import { onMounted, onUnmounted, ref, computed } from "vue";
import { useRoute } from "vue-router";
import { useLedgerStore } from "@/stores/ledgerStore.ts";
import { useUpdateStore } from "@/stores/updateStore";

const route = useRoute();
const ledgerStore = useLedgerStore();
const showWorkspaceSelect = ref(false);
const updateStore = useUpdateStore();
const showBottomBar = computed(() =>
    route.path === '/tr_view' || route.path === '/da_view' || route.path === '/key_event_view'
    || updateStore.status === 'downloading'
);
let unsubKernelRestarted: (() => void) | null = null
let kernelRecovering = false
// 后台服务重启后重挂当前页面（key 变化触发），让页面重新从后端拉取数据
const workspaceRecoveryToken = ref(0)
const routerViewKey = computed(() => `${route.path}:${workspaceRecoveryToken.value}`)

const handleOpenWorkspace = async (workspaceDir: string) => {
  try {
    await ledgerStore.switchWorkspace(workspaceDir);
    showWorkspaceSelect.value = false;
  } catch {
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
    await ledgerStore.switchWorkspace(workspaceDir);
    showWorkspaceSelect.value = false;
  } catch {
    showWorkspaceSelect.value = true;
  }
}

function onWorkspaceRequired() {
  showWorkspaceSelect.value = true
}

// 后台服务被重启后：内核内存中的工作空间已被清空，必须重新调用后端接口打开工作空间；
// 成功后重挂当前路由视图刷新页面数据，不整窗刷新，尽量保留当前页面与输入状态。
async function onKernelRestarted() {
  if (kernelRecovering) return;
  kernelRecovering = true;
  try {
    await initWorkspace();
    if (!showWorkspaceSelect.value) {
      workspaceRecoveryToken.value += 1;
    }
  } catch {
    // 取不到已保存工作空间或接口调用失败：退回手动选择
    showWorkspaceSelect.value = true;
  } finally {
    kernelRecovering = false;
  }
}

onMounted(() => {
  initWorkspace()
  window.addEventListener('workspace-required', onWorkspaceRequired)
  unsubKernelRestarted = window.electronAPI?.onKernelRestarted?.(onKernelRestarted) ?? null
})

onUnmounted(() => {
  window.removeEventListener('workspace-required', onWorkspaceRequired)
  unsubKernelRestarted?.()
})
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  width: 100vw;
  overflow: hidden;
  background-color: var(--transactions-color-major-background);
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
  background-color: var(--transactions-color-sidebar-fill);
  flex-shrink: 0;
  border-right: 1px solid var(--transactions-color-border-l1);
  display: flex;
  flex-direction: column;
}

/* 内容区域 */
.app-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  background-color: var(--transactions-color-bg-base);
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
  transition: opacity 220ms var(--transactions-ease-out-expo),
              transform 220ms var(--transactions-ease-out-expo);
}

.page-fade-leave-active {
  transition: opacity 140ms ease;
}

.page-fade-enter-from,
.page-fade-leave-to {
  opacity: 0;
}

.page-fade-enter-from {
  transform: translateY(4px);
}

/* 底部状态栏 */
.app-footer {
  height: var(--transactions-size-footer-height);
  background-color: var(--transactions-color-bg-base);
  flex-shrink: 0;
  border-top: 1px solid var(--transactions-color-border-l1);
}
</style>
