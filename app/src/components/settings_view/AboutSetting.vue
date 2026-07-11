<template>
  <div class="about-setting">
    <div class="about-header">
      <div class="app-logo">
        <svg width="1024" height="1024" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="1024" height="1024" rx="200" ry="200" fill="#4A8E70" />
          <text x="512" y="540" dominant-baseline="central" text-anchor="middle"
            font-family="Inter, system-ui, -apple-system, sans-serif" font-size="820" font-weight="600"
            fill="#FAFAF8" letter-spacing="-8">T</text>
        </svg>
      </div>
      <h2 class="app-name">Transactions</h2>
      <p class="app-version">版本 {{ appVersion || '...' }}</p>
    </div>

    <!-- 更新区域 -->
    <div class="about-update">
      <!-- checking -->
      <div v-if="updateStore.status === 'checking'" class="update-row">
        <a-spin size="small" />
        <span class="update-text">正在检查更新...</span>
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
          stroke-color="var(--billadm-color-primary)"
          trail-color="var(--billadm-color-divider)"
          style="width: 200px"
        />
        <span class="update-text">{{ updateStore.downloadPercent }}%</span>
      </div>

      <!-- downloaded -->
      <div v-else-if="updateStore.status === 'downloaded'" class="update-row update-success">
        <CheckCircleOutlined class="update-icon" />
        <span class="update-text">下载完成</span>
        <a-button type="primary" size="small" @click="handleInstall">安装并退出</a-button>
      </div>

      <!-- error -->
      <div v-else-if="updateStore.status === 'error'" class="update-row update-error">
        <CloseCircleOutlined class="update-icon" />
        <span class="update-text">{{ updateStore.errorMessage || '检查失败，请稍后重试' }}</span>
        <a-button size="small" @click="handleRetry">重试</a-button>
      </div>
    </div>

    <!-- release body -->
    <div v-if="updateStore.status === 'available' && updateStore.releaseBody" class="about-release-body">
      <div class="release-body-content" v-text="updateStore.releaseBody"></div>
    </div>

    <div class="about-copyright">
      <p>&copy; {{ new Date().getFullYear() }} Transactions. All rights reserved.</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';
import { CheckCircleOutlined, CloseCircleOutlined } from "@ant-design/icons-vue";
import { useUpdateStore } from "@/stores/updateStore";

const appVersion = ref('');
const updateStore = useUpdateStore();

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
  gap: var(--billadm-space-lg);
  padding: var(--billadm-space-xl) 0;
}

.about-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--billadm-space-md);
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
  font-family: var(--billadm-font-display);
  font-size: var(--billadm-size-text-display-sm);
  font-weight: 600;
  color: var(--billadm-color-text-major);
  margin: 0;
}

.app-version {
  font-size: var(--billadm-size-text-body);
  color: var(--billadm-color-text-secondary);
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
  gap: var(--billadm-space-md);
}

.update-icon {
  font-size: var(--billadm-size-text-section);
}

.update-text {
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-secondary);
}

.update-success .update-text,
.update-success .update-icon {
  color: var(--billadm-color-income);
}

.update-error .update-text,
.update-error .update-icon {
  color: var(--billadm-color-expense);
}

.about-release-body {
  max-width: 420px;
  max-height: 120px;
  overflow-y: auto;
  padding: var(--billadm-space-md) var(--billadm-space-lg);
  background: var(--billadm-color-hover-bg);
  border-radius: var(--billadm-radius-md);
  border: 1px solid var(--billadm-color-divider);
}

.release-body-content {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  white-space: pre-wrap;
  line-height: 1.5;
}

.about-copyright {
  text-align: center;
  color: var(--billadm-color-text-secondary);
  font-size: var(--billadm-size-text-caption);
}
</style>
