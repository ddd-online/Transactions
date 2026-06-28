# 通用设置页 + DevTools 开关 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在设置页面新增"通用"标签页，首期包含 DevTools 开关卡片。

**Architecture:** Electron IPC 桥接 `window.electronAPI.toggleDevTools(enabled)` → main process 调用 `webContents.openDevTools({mode:'right'})` / `closeDevTools()`。Vue 组件读取 `window.electronAPI` 判断 Electron 环境，隐藏非 Electron 下的设置项。

**Tech Stack:** Vue 3, TypeScript, Electron IPC, Ant Design Vue

## Global Constraints

- 不持久化开关状态
- 不在非 Electron 环境中显示设置项
- 不在 DevTools 被手动关闭时反向同步开关
- 首期不添加其他设置项

---

### Task 1: Electron IPC 层 — devtools:toggle

**Files:**
- Modify: `electron/src/main.js`
- Modify: `electron/src/preload.js`
- Modify: `app/src/types/electron.d.ts`

**Interfaces:**
- Produces: `window.electronAPI.toggleDevTools(enabled: boolean): void`

---

- [ ] **Step 1: 在 main.js 中添加 IPC 处理器**

打开 `electron/src/main.js`，在 `registerCommonHandlers` 函数内部的 `ipcMain.handle('app', ...)` 之后（约第 149 行 `});` 闭合前），插入：

```js
ipcMain.on('devtools:toggle', (event, enabled) => {
    if (mainWindow) {
        if (enabled) {
            mainWindow.webContents.openDevTools({ mode: 'right' });
        } else {
            mainWindow.webContents.closeDevTools();
        }
    }
});
```

完整上下文（`registerCommonHandlers` 函数的尾部变为）：

```js
    ipcMain.handle('app', async (event, field) => {
        switch (field) {
            case 'name':
                return app.getName();
            case 'version':
                return app.getVersion();
            case 'apiServer':
                return API_SERVER;
            default:
                return '';
        }
    });

    ipcMain.on('devtools:toggle', (event, enabled) => {
        if (mainWindow) {
            if (enabled) {
                mainWindow.webContents.openDevTools({ mode: 'right' });
            } else {
                mainWindow.webContents.closeDevTools();
            }
        }
    });
};
```

---

- [ ] **Step 2: 在 preload.js 中添加桥接**

打开 `electron/src/preload.js`，在 `contextBridge.exposeInMainWorld` 对象内（`getApiServer` 之后），插入：

```js
toggleDevTools: (enabled) => {
    ipcRenderer.send('devtools:toggle', enabled);
},
```

完整上下文：

```js
contextBridge.exposeInMainWorld('electronAPI', {
    minimizeWindow: () => { ... },
    // ... 现有方法 ...
    getApiServer: async () => {
        return await ipcRenderer.invoke('app', 'apiServer');
    },
    toggleDevTools: (enabled) => {
        ipcRenderer.send('devtools:toggle', enabled);
    },
});
```

---

- [ ] **Step 3: 更新类型声明**

打开 `app/src/types/electron.d.ts`，在 `Window.electronAPI` 接口末尾添加：

```typescript
toggleDevTools: (enabled: boolean) => void;
```

---

- [ ] **Step 4: 语法检查 + 提交**

```bash
cd electron/src && node --check main.js && node --check preload.js
```

预期：静默通过。

```bash
git add electron/src/main.js electron/src/preload.js app/src/types/electron.d.ts
git commit -m "feat: 添加 devtools:toggle IPC 桥接"
```

---

### Task 2: GeneralSetting 组件 + 设置卡片 UI

**Files:**
- Create: `app/src/components/settings_view/GeneralSetting.vue`

**Interfaces:**
- Consumes: `window.electronAPI?.toggleDevTools(enabled: boolean): void` (from Task 1)
- Consumes: `ant-design-vue` Switch 组件

---

- [ ] **Step 1: 创建 GeneralSetting.vue**

新建文件 `app/src/components/settings_view/GeneralSetting.vue`：

```vue
<template>
  <div class="general-setting">
    <BilladmPageHeader title="通用" />

    <div class="setting-list">
      <!-- DevTools 开关 -->
      <div class="setting-card">
        <div class="setting-info">
          <span class="setting-title">开发者工具</span>
          <span class="setting-desc">打开 Chromium DevTools，用于调试前端代码</span>
        </div>
        <div class="setting-action">
          <a-switch
            v-model:checked="devToolsEnabled"
            @change="onDevToolsToggle"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref } from 'vue'
import BilladmPageHeader from '@/components/common/BilladmPageHeader.vue'

const isElectron = typeof window !== 'undefined' && !!window.electronAPI

const devToolsEnabled = ref(false)

const onDevToolsToggle = (enabled: boolean) => {
  if (isElectron && window.electronAPI?.toggleDevTools) {
    window.electronAPI.toggleDevTools(enabled)
  }
  devToolsEnabled.value = enabled
}
</script>

<style scoped>
.general-setting {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.setting-list {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-xs);
}

.setting-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--billadm-space-md) var(--billadm-space-lg);
  background-color: var(--billadm-color-major-background);
  border: 1px solid var(--billadm-color-divider);
  border-radius: var(--billadm-radius-md);
  transition: background-color var(--billadm-transition-fast);
}

.setting-card:hover {
  background-color: var(--billadm-color-hover-bg);
}

.setting-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.setting-title {
  font-size: var(--billadm-size-text-body);
  font-weight: 500;
  color: var(--billadm-color-text-major);
}

.setting-desc {
  font-size: var(--billadm-size-text-caption);
  color: var(--billadm-color-text-secondary);
}

.setting-action {
  flex-shrink: 0;
  margin-left: var(--billadm-space-lg);
}
</style>
```

---

- [ ] **Step 2: 类型检查 + 提交**

```bash
cd app && npx vue-tsc -b --noEmit
```

预期：静默通过。

```bash
git add app/src/components/settings_view/GeneralSetting.vue
git commit -m "feat: 新增 GeneralSetting 组件 — DevTools 开关卡片"
```

---

### Task 3: SettingsView 集成

**Files:**
- Modify: `app/src/components/settings_view/SettingsView.vue`

**Interfaces:**
- Consumes: `GeneralSetting` 组件 (from Task 2)
- Modifies: 左侧导航栏 + 动态组件映射

---

- [ ] **Step 1: 在 SettingsView 中添加"通用"导航项和组件注册**

打开 `app/src/components/settings_view/SettingsView.vue`。

**a) 导入组件**（在现有 import 之后添加）：

```typescript
import GeneralSetting from './GeneralSetting.vue';
```

**b) 导入图标**（在现有 Ant Design 图标导入中添加 `SettingOutlined`）：

```typescript
import {
  FolderOpenOutlined,
  FileTextOutlined,
  SettingOutlined,
  InfoCircleOutlined
} from "@ant-design/icons-vue";
```

**c) 注册组件映射**（在 `componentMap` 中添加 `'general'` 条目）：

```typescript
const componentMap = {
  'workspace': WorkspaceSetting,
  'template': BilladmTemplateSetting,
  'general': GeneralSetting,
  'about': AboutSetting,
};
```

**d) 添加导航按钮**（在"消费模板"按钮之后，"关于"按钮之前）：

```html
<button
  class="nav-item"
  :class="{ active: activeComponent === 'general' }"
  @click="activeComponent = 'general'"
  aria-label="通用"
>
  <SettingOutlined class="nav-icon"/>
  <span class="nav-text">通用</span>
</button>
```

---

- [ ] **Step 2: 类型检查 + 提交**

```bash
cd app && npx vue-tsc -b --noEmit
```

预期：静默通过。

```bash
git add app/src/components/settings_view/SettingsView.vue
git commit -m "feat: SettingsView 集成通用设置页"
```

---

## 实现后验证

启动 Electron 应用，进入设置 → 通用：
1. 确认"开发者工具"卡片正常渲染，左侧标题+描述，右侧开关
2. 打开开关 → DevTools 应在主窗口右侧出现
3. 关闭开关 → DevTools 应关闭
4. 切换到其他标签再切回 → 组件正常工作
