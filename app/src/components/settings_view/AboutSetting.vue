<template>
  <div class="about-setting">
    <div class="about-header">
      <div class="app-logo">
        <svg width="1024" height="1024" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
          <!-- Background: DeepSeek blue（跟随主题的主色令牌） -->
          <rect x="0" y="0" width="1024" height="1024" rx="200" ry="200" style="fill: var(--transactions-color-primary)" />
          <!-- Letter Tr: Segoe UI Bold 矢量路径（与 ICO 字形一致），已按墨迹包围盒居中 -->
          <path transform="translate(220.909996509552 49.1699676513672)" fill="#FFFFFF" d="M363.01 322.09 L236.22 322.09 L236.22 685.1 L135.78 685.1 L135.78 322.09 L9.61 322.09 L9.61 240.56 L363.01 240.56 Z M572.57 456.01 C560.79 449.6 547.05 446.4 531.34 446.4 C510.05 446.4 493.42 454.2 481.43 469.81 C469.44 485.41 463.45 506.64 463.45 533.51 L463.45 685.1 L365.49 685.1 L365.49 367.66 L463.45 367.66 L463.45 426.56 L464.69 426.56 C480.19 383.57 508.09 362.08 548.39 362.08 C558.72 362.08 566.78 363.32 572.57 365.8 Z" />
        </svg>
      </div>
      <h2 class="app-name">Transactions</h2>
      <p class="app-version">版本 {{ appVersion || '…' }}</p>
    </div>

    <!-- 更新区域 -->
    <div class="about-update">
      <!-- checking -->
      <div v-if="updateStore.status === 'checking'" class="update-row">
        <a-spin size="small" />
        <span class="update-text">正在检查更新…</span>
      </div>

      <!-- no-update -->
      <div v-else-if="updateStore.status === 'no-update'" class="update-row update-success">
        <CheckCircleOutlined class="update-icon" />
        <span class="update-text">已是最新版本</span>
      </div>

      <!-- available -->
      <div v-else-if="updateStore.status === 'available'" class="update-row update-available">
        <span class="update-text">发现新版本 <strong>v{{ updateStore.latestVersion }}</strong></span>
        <a-button type="primary" size="small" @click="handleDownload">立即更新</a-button>
      </div>

      <!-- downloading -->
      <div v-else-if="updateStore.status === 'downloading'" class="update-row">
        <a-progress
          :percent="updateStore.downloadPercent"
          :show-info="false"
          size="small"
          stroke-color="var(--transactions-color-primary)"
          trail-color="var(--transactions-color-divider)"
          style="width: 200px"
        />
        <span class="update-text">{{ updateStore.downloadPercent }}%</span>
      </div>

      <!-- downloaded -->
      <div v-else-if="updateStore.status === 'downloaded'" class="update-row update-row--downloaded update-success">
        <div class="update-done-line">
          <CheckCircleOutlined class="update-icon" />
          <span class="update-text">下载完成</span>
        </div>
        <a-button type="primary" size="small" @click="handleInstall">安装并退出</a-button>
      </div>

      <!-- error -->
      <div v-else-if="updateStore.status === 'error'" class="update-row update-error">
        <CloseCircleOutlined class="update-icon" />
        <span class="update-text">{{ updateStore.errorMessage || '检查失败，请稍后重试' }}</span>
        <a-button size="small" @click="handleRetry">重试</a-button>
      </div>
    </div>

    <!-- 更新说明（Markdown） -->
    <div v-if="showReleaseBody" class="about-release-body">
      <MarkdownViewer :content="updateStore.releaseBody" />
    </div>

    <div class="about-copyright">
      <p>&copy; {{ new Date().getFullYear() }} Transactions. All rights reserved.</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted, computed } from 'vue';
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons-vue";
import { useUpdateStore } from "@/stores/updateStore";
import MarkdownViewer from '@/components/common/MarkdownViewer.vue';

const appVersion = ref('');
const updateStore = useUpdateStore();

// 下载/完成/失败等阶段保留更新说明，方便用户了解本次更新内容
const showReleaseBody = computed(() => {
  const status = updateStore.status
  return !!updateStore.releaseBody &&
    (status === 'available' || status === 'downloading' || status === 'downloaded' || status === 'error')
})

onMounted(async () => {
  try {
    appVersion.value = await window.electronAPI.getAppInfo('version');
  } catch {
    appVersion.value = 'unknown';
  }
  // 自动检查更新
  await updateStore.checkForUpdate();
});

const handleDownload = () => {
  updateStore.downloadUpdate();
};

const handleInstall = () => {
  updateStore.installUpdate();
};

const handleRetry = () => {
  updateStore.checkForUpdate();
};
</script>

<style scoped>
.about-setting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--transactions-space-lg);
  padding: var(--transactions-space-md) var(--transactions-space-lg);
}

.about-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--transactions-space-md);
}

.app-logo {
  width: 96px;
  height: 96px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.app-logo svg {
  width: 96px;
  height: 96px;
}

.app-name {
  font-family: var(--transactions-font-display);
  font-size: var(--transactions-size-text-display-sm);
  font-weight: 600;
  color: var(--transactions-color-text-major);
  margin: 0;
}

.app-version {
  font-size: var(--transactions-size-text-body);
  color: var(--transactions-color-text-secondary);
  margin: 0;
}

/* 更新区域 */
.about-update {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 36px;
}

.update-row {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-md);
}

.update-row--downloaded {
  flex-direction: column;
  align-items: center;
  gap: var(--transactions-space-md);
}

.update-done-line {
  display: flex;
  align-items: center;
  gap: var(--transactions-space-md);
}

.update-icon {
  font-size: var(--transactions-size-text-section);
}

.update-text {
  font-size: var(--transactions-size-text-body-sm);
  color: var(--transactions-color-text-secondary);
}

.update-success .update-text,
.update-success .update-icon {
  color: var(--transactions-color-primary);
}

.update-error .update-text,
.update-error .update-icon {
  color: var(--transactions-color-expense);
}

.about-release-body {
  width: min(480px, 100%);
  max-height: 168px;
  overflow-y: auto;
  padding: var(--transactions-space-md) var(--transactions-space-lg);
  background: var(--transactions-color-hover-bg);
  border-radius: var(--transactions-radius-md);
  border: 1px solid var(--transactions-color-divider);
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  line-height: var(--transactions-height-normal);
}

.about-release-body :deep(.markdown-viewer) {
  font-size: var(--transactions-size-text-caption);
  color: var(--transactions-color-text-secondary);
  line-height: var(--transactions-height-normal);
  word-break: break-word;
}

.about-release-body :deep(p) {
  margin: var(--transactions-space-xs) 0;
}

.about-release-body :deep(h1),
.about-release-body :deep(h2),
.about-release-body :deep(h3),
.about-release-body :deep(h4) {
  margin: var(--transactions-space-sm) 0 var(--transactions-space-xs);
  font-weight: var(--transactions-weight-semibold);
  color: var(--transactions-color-text-major);
  line-height: var(--transactions-height-snug);
}

.about-release-body :deep(h1) {
  font-size: var(--transactions-size-text-title-sm);
}

.about-release-body :deep(h2) {
  font-size: var(--transactions-size-text-section);
}

.about-release-body :deep(h3),
.about-release-body :deep(h4) {
  font-size: var(--transactions-size-text-body);
}

.about-release-body :deep(ul),
.about-release-body :deep(ol) {
  margin: var(--transactions-space-xs) 0;
  padding-left: var(--transactions-space-xl);
}

.about-release-body :deep(li) {
  margin: var(--transactions-space-2xs) 0;
}

.about-release-body :deep(blockquote) {
  margin: var(--transactions-space-xs) 0;
  padding-left: var(--transactions-space-md);
  border-left: 2px solid var(--transactions-color-border-l2);
  color: var(--transactions-color-text-tertiary);
}

.about-release-body :deep(a) {
  color: var(--transactions-color-primary);
  text-decoration: none;
}

.about-release-body :deep(a:hover) {
  text-decoration: underline;
}

.about-release-body :deep(code) {
  font-family: var(--transactions-font-mono);
  font-size: 0.92em;
  background: var(--transactions-color-major-background);
  padding: 1px var(--transactions-space-xs);
  border-radius: var(--transactions-radius-sm);
}

.about-release-body :deep(pre) {
  margin: var(--transactions-space-sm) 0;
  padding: var(--transactions-space-sm) var(--transactions-space-md);
  background: var(--transactions-color-major-background);
  border-radius: var(--transactions-radius-md);
  overflow-x: auto;
}

.about-release-body :deep(pre code) {
  background: none;
  padding: 0;
}

.about-release-body :deep(hr) {
  border: none;
  border-top: 1px solid var(--transactions-color-divider);
  margin: var(--transactions-space-sm) 0;
}

.about-release-body :deep(img) {
  max-width: 100%;
  border-radius: var(--transactions-radius-sm);
}

.about-release-body :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: var(--transactions-space-xs) 0;
}

.about-release-body :deep(th),
.about-release-body :deep(td) {
  padding: var(--transactions-space-2xs) var(--transactions-space-xs);
  border: 1px solid var(--transactions-color-border-l2);
  text-align: left;
}

.about-release-body :deep(th) {
  background: var(--transactions-color-minor-background);
  font-weight: var(--transactions-weight-medium);
}

.about-copyright {
  text-align: center;
  color: var(--transactions-color-text-secondary);
  font-size: var(--transactions-size-text-caption);
}
</style>
