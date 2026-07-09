# 版本检查与自动更新 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在关于页自动检查 GitHub Release 新版本，支持主进程后台下载安装包、底部状态栏进度展示、手动触发安装

**Architecture:** 主进程负责 GitHub API 调用 + https 下载 + 安装拉起，渲染进程通过 Pinia store + IPC 管理状态和 UI。6 态状态机驱动关于页和底部状态栏的 UI 切换

**Tech Stack:** Electron (net/https/ipcMain/shell), Vue 3 + Pinia + TypeScript, Ant Design Vue (Spin/Progress/Button)

## Global Constraints

- 仅 Windows 平台（和现有 NSIS 安装包一致）
- 不需要后台自动检查 — 只在用户进关于页时触发
- 不需要增量更新/差分包 — 全量下载
- 不需要静默安装 — NSIS 安装程序需要用户交互
- 不持久化下载进度 — 应用退出后进度重置
- GitHub API 公开仓库无需鉴权，忽略 pre-release

---

### Task 1: 主进程 IPC handlers（update:check / download / cancel / install）

**Files:**
- Modify: `electron/src/main.js`

**Interfaces:**
- Consumes: `app`, `ipcMain`, `net`, `https`, `fs`, `os`, `path`, `shell` (Electron built-ins)
- Produces:
  - IPC channel `update:check` → main process calls GitHub API, returns `{ hasUpdate: boolean, latestVersion: string, downloadUrl: string, body: string }`
  - IPC channel `update:download` → main process starts https download to `os.tmpdir()/Transactions-v{version}.exe`, sends progress/completion/error events
  - IPC channel `update:cancel` → aborts download, cleans temp file
  - IPC channel `update:install` → `shell.openPath(filePath)` + `app.quit()`

所有 handler 放在 `registerCommonHandlers()` 函数内，与现有 `dialog:open` / `workspace:*` / `app` / `devtools:toggle` 并列。

- [ ] **Step 1: 在头部添加 https 和 shell 的 require**

在文件顶部 `const os = require('os');` 之后添加：

```js
const https = require('https');
const { shell } = require('electron');
```

- [ ] **Step 2: 在 `registerCommonHandlers` 末尾添加下载状态变量（在现有代码之后，函数结束之前）**

在 `ipcMain.on('devtools:toggle', ...)` 之后，`registerCommonHandlers` 函数结束 `};` 之前插入：

```js
    // ── 更新 ──
    let downloadAbortController = null;
    let downloadFilePath = null;

    ipcMain.handle('update:check', async () => {
        try {
            const data = await new Promise((resolve, reject) => {
                const url = 'https://api.github.com/repos/ddd-online/Transactions/releases/latest';
                const req = https.get(url, {
                    headers: {
                        'User-Agent': 'Transactions-App',
                        'Accept': 'application/vnd.github+json',
                    },
                }, (res) => {
                    let body = '';
                    res.on('data', chunk => body += chunk);
                    res.on('end', () => {
                        try {
                            resolve(JSON.parse(body));
                        } catch (e) {
                            reject(new Error('Invalid JSON response'));
                        }
                    });
                });
                req.on('error', reject);
                req.setTimeout(15000, () => {
                    req.destroy();
                    reject(new Error('Request timeout'));
                });
            });

            if (data.prerelease) {
                return { hasUpdate: false, latestVersion: '', downloadUrl: '', body: '' };
            }

            const latestVersion = (data.tag_name || '').replace(/^v/, '');
            const currentVersion = app.getVersion().replace(/^v/, '');

            const partsLatest = latestVersion.split('.').map(Number);
            const partsCurrent = currentVersion.split('.').map(Number);
            let hasUpdate = false;
            for (let i = 0; i < Math.max(partsLatest.length, partsCurrent.length); i++) {
                const a = partsLatest[i] || 0;
                const b = partsCurrent[i] || 0;
                if (a > b) { hasUpdate = true; break; }
                if (a < b) { break; }
            }

            if (!hasUpdate) {
                return { hasUpdate: false, latestVersion: '', downloadUrl: '', body: '' };
            }

            const asset = data.assets?.find(a => a.browser_download_url?.endsWith('.exe'));
            const downloadUrl = asset?.browser_download_url || '';
            return {
                hasUpdate: true,
                latestVersion,
                downloadUrl,
                body: data.body || '',
            };
        } catch (e) {
            log(`update:check error: ${e.message}`);
            return { hasUpdate: false, latestVersion: '', downloadUrl: '', body: '', error: e.message };
        }
    });

    ipcMain.on('update:download', (event) => {
        // 从 check 结果中获取 downloadUrl（通过共享变量传递，或由 renderer 在 invoke 后自行触发）
        // 此处由 renderer 端 store 调用 downloadUpdate 时通过 invoke 获取 URL
    });

    ipcMain.on('update:cancel', () => {
        if (downloadAbortController) {
            downloadAbortController.abort();
            downloadAbortController = null;
        }
        if (downloadFilePath && fs.existsSync(downloadFilePath)) {
            try { fs.unlinkSync(downloadFilePath); } catch {}
        }
        downloadFilePath = null;
    });

    ipcMain.handle('update:install', async () => {
        if (!downloadFilePath || !fs.existsSync(downloadFilePath)) {
            return { success: false, error: '安装文件不存在' };
        }
        try {
            await shell.openPath(downloadFilePath);
            setImmediate(() => app.quit());
            return { success: true };
        } catch (e) {
            log(`update:install error: ${e.message}`);
            return { success: false, error: e.message };
        }
    });
```

- [ ] **Step 3: 修改 download handler — 改为 invoke 方式支持传参**

把 Step 2 中的 `ipcMain.on('update:download', ...)` 占位替换为 `ipcMain.handle` 完整实现（renderer 用 `invoke('update:download', url)` 触发）：

```js
    ipcMain.handle('update:download', async (event, downloadUrl) => {
        try {
            // Cancel any existing download
            if (downloadAbortController) {
                downloadAbortController.abort();
            }
            downloadAbortController = new AbortController();

            const urlObj = new URL(downloadUrl);
            const fileName = path.basename(urlObj.pathname);
            downloadFilePath = path.join(os.tmpdir(), fileName);

            // If file already exists from a previous completed download, reuse it
            if (fs.existsSync(downloadFilePath)) {
                const stats = fs.statSync(downloadFilePath);
                mainWindow.webContents.send('update:download-complete', { filePath: downloadFilePath });
                return { success: true };
            }

            await new Promise((resolve, reject) => {
                const req = https.get(downloadUrl, { signal: downloadAbortController.signal }, (res) => {
                    // Handle redirect
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        reject(new Error('Redirect not supported; use direct URL'));
                        return;
                    }

                    const total = parseInt(res.headers['content-length'] || '0', 10);
                    let downloaded = 0;
                    const startTime = Date.now();
                    const chunks = [];

                    res.on('data', (chunk) => {
                        chunks.push(chunk);
                        downloaded += chunk.length;
                        const percent = total > 0 ? Math.round((downloaded / total) * 100) : 0;
                        const elapsed = (Date.now() - startTime) / 1000;
                        const speed = elapsed > 0 ? formatSpeed(downloaded / elapsed) : '0 B/s';

                        mainWindow.webContents.send('update:download-progress', {
                            percent,
                            downloaded,
                            total,
                            speed,
                        });
                    });

                    res.on('end', () => {
                        const buffer = Buffer.concat(chunks);
                        try {
                            fs.writeFileSync(downloadFilePath, buffer);
                            downloadAbortController = null;
                            mainWindow.webContents.send('update:download-complete', { filePath: downloadFilePath });
                            resolve();
                        } catch (e) {
                            reject(e);
                        }
                    });

                    res.on('error', reject);
                });

                req.on('error', (e) => {
                    if (e.name === 'AbortError') {
                        resolve(); // Cancelled silently
                    } else {
                        reject(e);
                    }
                });

                downloadAbortController.signal.addEventListener('abort', () => {
                    req.destroy();
                    resolve();
                });
            });

            return { success: true };
        } catch (e) {
            log(`update:download error: ${e.message}`);
            if (downloadFilePath && fs.existsSync(downloadFilePath)) {
                try { fs.unlinkSync(downloadFilePath); } catch {}
            }
            downloadFilePath = null;
            downloadAbortController = null;
            mainWindow.webContents.send('update:download-error', { message: e.message });
            return { success: false, error: e.message };
        }
    });

    function formatSpeed(bytesPerSec) {
        if (bytesPerSec >= 1048576) return (bytesPerSec / 1048576).toFixed(1) + ' MB/s';
        if (bytesPerSec >= 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
        return Math.round(bytesPerSec) + ' B/s';
    }
```

- [ ] **Step 4: 将 `formatSpeed` 移到 `registerCommonHandlers` 外部**

Step 3 中 `formatSpeed` 在函数内定义不合适，把它的定义移到 `registerCommonHandlers` 函数**之前**的顶部区域（与其他工具函数并列）：

```js
// 在 registerCommonHandlers 之前添加
const formatSpeed = (bytesPerSec) => {
    if (bytesPerSec >= 1048576) return (bytesPerSec / 1048576).toFixed(1) + ' MB/s';
    if (bytesPerSec >= 1024) return (bytesPerSec / 1024).toFixed(1) + ' KB/s';
    return Math.round(bytesPerSec) + ' B/s';
};
```

并从 Step 3 的代码块中删除内部的 `function formatSpeed` 定义。

- [ ] **Step 5: Commit**

```bash
git add electron/src/main.js
git commit -m "feat: 主进程增加更新检查/下载/取消/安装 IPC handlers"
```

---

### Task 2: Preload 扩展 + TypeScript 类型声明

**Files:**
- Modify: `electron/src/preload.js`
- Modify: `app/src/types/electron.d.ts`

**Interfaces:**
- Consumes: 主进程的 4 个 update:* IPC 通道 + 3 个主进程推送事件
- Produces: `electronAPI.checkUpdate()`, `downloadUpdate(url)`, `cancelDownload()`, `installUpdate()`, `onDownloadProgress(cb)`, `onDownloadComplete(cb)`, `onDownloadError(cb)` — 每个事件监听器返回取消订阅函数

- [ ] **Step 1: 扩展 `electron/src/preload.js`**

在 `contextBridge.exposeInMainWorld('electronAPI', {...})` 的现有方法之后（`toggleDevTools` 之后），添加：

```js
    // ── 更新 ──
    checkUpdate: async () => {
        return await ipcRenderer.invoke('update:check');
    },
    downloadUpdate: async (url) => {
        return await ipcRenderer.invoke('update:download', url);
    },
    cancelDownload: () => {
        ipcRenderer.send('update:cancel');
    },
    installUpdate: async () => {
        return await ipcRenderer.invoke('update:install');
    },
    onDownloadProgress: (cb) => {
        const handler = (_event, data) => cb(data);
        ipcRenderer.on('update:download-progress', handler);
        return () => ipcRenderer.removeListener('update:download-progress', handler);
    },
    onDownloadComplete: (cb) => {
        const handler = (_event, data) => cb(data);
        ipcRenderer.on('update:download-complete', handler);
        return () => ipcRenderer.removeListener('update:download-complete', handler);
    },
    onDownloadError: (cb) => {
        const handler = (_event, data) => cb(data);
        ipcRenderer.on('update:download-error', handler);
        return () => ipcRenderer.removeListener('update:download-error', handler);
    },
```

- [ ] **Step 2: 扩展 `app/src/types/electron.d.ts`**

在 `Window` 接口的 `electronAPI` 中，`toggleDevTools` 之后添加：

```ts
            // ── 更新 ──
            checkUpdate: () => Promise<{
                hasUpdate: boolean;
                latestVersion: string;
                downloadUrl: string;
                body: string;
                error?: string;
            }>;
            downloadUpdate: (url: string) => Promise<{ success: boolean; error?: string }>;
            cancelDownload: () => void;
            installUpdate: () => Promise<{ success: boolean; error?: string }>;
            onDownloadProgress: (cb: (data: {
                percent: number;
                downloaded: number;
                total: number;
                speed: string;
            }) => void) => () => void;
            onDownloadComplete: (cb: (data: { filePath: string }) => void) => () => void;
            onDownloadError: (cb: (data: { message: string }) => void) => () => void;
```

- [ ] **Step 3: 验证类型**

```bash
cd app && npx vue-tsc -b
```

Expected: 无类型错误。

- [ ] **Step 4: Commit**

```bash
git add electron/src/preload.js app/src/types/electron.d.ts
git commit -m "feat: preload 扩展更新 API + TypeScript 类型声明"
```

---

### Task 3: Pinia updateStore

**Files:**
- Create: `app/src/stores/updateStore.ts`

**Interfaces:**
- Consumes: `window.electronAPI` 更新相关方法
- Produces:
  - State: `status`, `latestVersion`, `downloadPercent`, `downloadSpeed`, `errorMessage`, `filePath`, `releaseBody`
  - Actions: `checkForUpdate()`, `downloadUpdate()`, `installUpdate()`, `reset()`
  - Store ID: `'updateStore'`

- [ ] **Step 1: 创建 `app/src/stores/updateStore.ts`**

```ts
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type UpdateStatus =
    | 'idle'
    | 'checking'
    | 'available'
    | 'no-update'
    | 'downloading'
    | 'downloaded'
    | 'error'

export const useUpdateStore = defineStore('updateStore', () => {
    const status = ref<UpdateStatus>('idle')
    const latestVersion = ref<string>('')
    const downloadPercent = ref<number>(0)
    const downloadSpeed = ref<string>('')
    const errorMessage = ref<string>('')
    const filePath = ref<string>('')
    const releaseBody = ref<string>('')
    const downloadUrl = ref<string>('')

    let unsubProgress: (() => void) | null = null
    let unsubComplete: (() => void) | null = null
    let unsubError: (() => void) | null = null

    const cleanupListeners = () => {
        unsubProgress?.()
        unsubComplete?.()
        unsubError?.()
        unsubProgress = null
        unsubComplete = null
        unsubError = null
    }

    const checkForUpdate = async () => {
        status.value = 'checking'
        errorMessage.value = ''
        try {
            const result = await window.electronAPI.checkUpdate()
            if (result.error) {
                status.value = 'error'
                errorMessage.value = result.error
                return
            }
            if (result.hasUpdate) {
                status.value = 'available'
                latestVersion.value = result.latestVersion
                downloadUrl.value = result.downloadUrl
                releaseBody.value = result.body
            } else {
                status.value = 'no-update'
            }
        } catch (e: any) {
            status.value = 'error'
            errorMessage.value = e?.message || '检查更新失败'
        }
    }

    const downloadUpdate = async () => {
        if (!downloadUrl.value) return
        status.value = 'downloading'
        downloadPercent.value = 0
        downloadSpeed.value = ''

        cleanupListeners()

        unsubProgress = window.electronAPI.onDownloadProgress((data) => {
            downloadPercent.value = data.percent
            downloadSpeed.value = data.speed
        })

        unsubComplete = window.electronAPI.onDownloadComplete((data) => {
            filePath.value = data.filePath
            status.value = 'downloaded'
            cleanupListeners()
        })

        unsubError = window.electronAPI.onDownloadError((data) => {
            status.value = 'error'
            errorMessage.value = data.message
            cleanupListeners()
        })

        const result = await window.electronAPI.downloadUpdate(downloadUrl.value)
        if (!result.success && status.value !== 'error') {
            status.value = 'error'
            errorMessage.value = result.error || '下载失败'
            cleanupListeners()
        }
    }

    const installUpdate = async () => {
        const result = await window.electronAPI.installUpdate()
        if (!result.success) {
            status.value = 'error'
            errorMessage.value = result.error || '安装启动失败'
        }
        // On success, app.quit() is called, no state update needed
    }

    const reset = () => {
        cleanupListeners()
        status.value = 'idle'
        latestVersion.value = ''
        downloadPercent.value = 0
        downloadSpeed.value = ''
        errorMessage.value = ''
        filePath.value = ''
        releaseBody.value = ''
        downloadUrl.value = ''
    }

    return {
        status,
        latestVersion,
        downloadPercent,
        downloadSpeed,
        errorMessage,
        filePath,
        releaseBody,
        checkForUpdate,
        downloadUpdate,
        installUpdate,
        reset,
    }
})
```

- [ ] **Step 2: 验证类型**

```bash
cd app && npx vue-tsc -b
```

Expected: 无类型错误。

- [ ] **Step 3: Commit**

```bash
git add app/src/stores/updateStore.ts
git commit -m "feat: 创建 updateStore Pinia store（6态状态机）"
```

---

### Task 4: Layout.vue — 下载中全局显示底部状态栏

**Files:**
- Modify: `app/src/components/Layout.vue`

**Interfaces:**
- Consumes: `useUpdateStore` from `@/stores/updateStore`
- Produces: `showBottomBar` 增加 `updateStore.status === 'downloading'` 条件

- [ ] **Step 1: 修改 `showBottomBar` computed**

将第 40 行：

```ts
const showBottomBar = computed(() => route.path === '/tr_view' || route.path === '/da_view' || route.path === '/key_event_view');
```

替换为：

```ts
const updateStore = useUpdateStore();
const showBottomBar = computed(() =>
    route.path === '/tr_view' || route.path === '/da_view' || route.path === '/key_event_view'
    || updateStore.status === 'downloading'
);
```

- [ ] **Step 2: 添加 import**

在 `<script setup>` 的 import 区域添加：

```ts
import { useUpdateStore } from "@/stores/updateStore";
```

- [ ] **Step 3: 验证类型**

```bash
cd app && npx vue-tsc -b
```

Expected: 无类型错误。

- [ ] **Step 4: Commit**

```bash
git add app/src/components/Layout.vue
git commit -m "feat: 下载中全局显示底部状态栏"
```

---

### Task 5: AppBottomBar.vue — 下载进度条

**Files:**
- Modify: `app/src/components/AppBottomBar.vue`

**Interfaces:**
- Consumes: `useUpdateStore` from `@/stores/updateStore`
- Produces: 下载中左侧显示进度条 + 百分比 + 速度，右侧保持统计

- [ ] **Step 1: 替换 template**

```vue
<template>
  <div class="bottom-bar">
    <div class="bottom-bar-left">
      <div v-if="updateStore.status === 'downloading'" class="download-progress">
        <a-progress
          :percent="updateStore.downloadPercent"
          :show-info="false"
          size="small"
          stroke-color="var(--billadm-color-primary)"
          trail-color="var(--billadm-color-divider)"
          style="width: 160px"
        />
        <span class="download-text">
          {{ updateStore.downloadPercent }}% · {{ updateStore.downloadSpeed }}
        </span>
      </div>
    </div>
    <div class="bottom-bar-right">
      <billadm-statistics-footer v-if="showStatistics" />
    </div>
  </div>
</template>
```

- [ ] **Step 2: 更新 script**

替换 `<script setup>` 块：

```ts
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useUpdateStore } from '@/stores/updateStore'
import BilladmStatisticsFooter from '@/components/common/BilladmStatisticsFooter.vue'

const route = useRoute()
const updateStore = useUpdateStore()

const showStatistics = computed(() => {
  return route.path === '/tr_view' || route.path === '/da_view' || route.path === '/key_event_view'
})
```

- [ ] **Step 3: 更新 style**

在 `<style scoped>` 中替换 `.bottom-bar` 规则并添加左侧样式：

```css
.bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  width: 100%;
  padding: 0 16px;
}

.bottom-bar > * {
  -webkit-app-region: no-drag;
}

.bottom-bar-left {
  display: flex;
  align-items: center;
}

.bottom-bar-right {
  display: flex;
  align-items: center;
}

.download-progress {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-md);
}

.download-text {
  font-family: var(--billadm-font-mono);
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
```

- [ ] **Step 4: 验证类型**

```bash
cd app && npx vue-tsc -b
```

Expected: 无类型错误。

- [ ] **Step 5: Commit**

```bash
git add app/src/components/AppBottomBar.vue
git commit -m "feat: 底部状态栏增加下载进度展示"
```

---

### Task 6: AboutSetting.vue — 更新区域 UI

**Files:**
- Modify: `app/src/components/settings_view/AboutSetting.vue`

**Interfaces:**
- Consumes: `useUpdateStore` from `@/stores/updateStore`
- Produces: 6 态更新区域 UI（idle/checking/no-update/available/downloading/downloaded/error）

- [ ] **Step 1: 替换 template**

```vue
<template>
  <div class="about-setting">
    <div class="about-header">
      <div class="app-logo">
        <svg width="1024" height="1024" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="1024" height="1024" rx="200" ry="200" fill="#4A8C6F" />
          <text x="512" y="540" dominant-baseline="central" text-anchor="middle"
            font-family="Playfair Display, Georgia, 'Times New Roman', serif" font-size="820" font-weight="600"
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
      <p>© {{ new Date().getFullYear() }} Transactions. All rights reserved.</p>
    </div>
  </div>
</template>
```

- [ ] **Step 2: 替换 script**

```ts
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
```

- [ ] **Step 3: 替换 style**

```css
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
  font-size: 16px;
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
```

- [ ] **Step 4: 验证类型**

```bash
cd app && npx vue-tsc -b
```

Expected: 无类型错误。

- [ ] **Step 5: Commit**

```bash
git add app/src/components/settings_view/AboutSetting.vue
git commit -m "feat: 关于页增加版本检查与更新功能（6态UI）"
```

---

### 最终验证

所有 Task 完成后，运行完整验证：

```bash
cd app && npx vue-tsc -b
cd kernel && go vet ./...
```

Expected: 全部通过。
