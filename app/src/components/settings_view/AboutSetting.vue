<template>
  <div class="about-setting">
    <div class="about-header">
      <div class="app-logo">
        <svg width="1024" height="1024" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
          <!-- Background: DeepSeek blue（跟随主题的主色令牌） -->
          <rect x="0" y="0" width="1024" height="1024" rx="200" ry="200" style="fill: var(--billadm-color-primary)" />
          <!-- Letter Tr: Segoe UI Bold 矢量路径（与 ICO 字形一致），已按墨迹包围盒居中 -->
          <path transform="translate(220.909996509552 49.1699676513672)" fill="#FFFFFF" d="M363.01 322.09 L236.22 322.09 L236.22 685.1 L135.78 685.1 L135.78 322.09 L9.61 322.09 L9.61 240.56 L363.01 240.56 Z M572.57 456.01 C560.79 449.6 547.05 446.4 531.34 446.4 C510.05 446.4 493.42 454.2 481.43 469.81 C469.44 485.41 463.45 506.64 463.45 533.51 L463.45 685.1 L365.49 685.1 L365.49 367.66 L463.45 367.66 L463.45 426.56 L464.69 426.56 C480.19 383.57 508.09 362.08 548.39 362.08 C558.72 362.08 566.78 363.32 572.57 365.8 Z" />
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
  padding: var(--billadm-space-md) var(--billadm-space-lg);
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
