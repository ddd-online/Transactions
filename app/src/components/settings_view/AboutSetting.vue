<template>
  <div class="about-setting">
    <div class="about-header">
      <div class="app-logo">
        <svg width="1024" height="1024" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
          <!-- Background: Teal green #4A8C6F -->
          <rect x="0" y="0" width="1024" height="1024" rx="200" ry="200" fill="#4A8C6F" />
          <!-- Letter T: Fills ~75% of icon, centered, Playfair Display font, color #FAFAF8 -->
          <text x="512" y="540" dominant-baseline="central" text-anchor="middle"
            font-family="Playfair Display, Georgia, 'Times New Roman', serif" font-size="820" font-weight="600"
            fill="#FAFAF8" letter-spacing="-8">T</text>
        </svg>
      </div>
      <h2 class="app-name">Transactions</h2>
      <p class="app-version">版本 {{ appVersion || '...' }}</p>
    </div>

    <div class="about-copyright">
      <p>© {{ new Date().getFullYear() }} Transactions. All rights reserved.</p>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, onMounted } from 'vue';

const appVersion = ref('');

onMounted(async () => {
  try {
    appVersion.value = await window.electronAPI.getAppInfo('version');
  } catch {
    appVersion.value = 'unknown';
  }
});
</script>

<style scoped>
.about-setting {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: var(--billadm-space-xl);
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


.about-copyright {
  text-align: center;
  color: var(--billadm-color-text-secondary);
  font-size: var(--billadm-size-text-caption);
}
</style>
