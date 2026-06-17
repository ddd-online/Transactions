# Layout Restructuring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure app layout to 200px left sidebar (ledger switcher + icon+text nav + settings) with floating window controls on the right content area.

**Architecture:** Remove the top header bar entirely. Expand the sidebar to 200px with a ledger dropdown button at top, 4 navigation items with icons+text, and settings at the bottom. Window controls (min/max/close) float absolutely over the content area's top-right corner.

**Tech Stack:** Vue 3 (Composition API), Ant Design Vue, vue-router (memory history), SCSS, Pinia (ledgerStore)

---

### Task 1: Rewrite Layout.vue

**Files:**
- Modify: `app/src/components/Layout.vue`

- [ ] **Step 1: Replace the template — remove header, restructure to sidebar + content with floating window controls**

```vue
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
        <!-- 沉浸式窗口控制按钮 -->
        <app-top-bar />
        <router-view class="app-router-view" />
        <footer v-if="showBottomBar" class="app-footer">
          <app-bottom-bar />
        </footer>
      </main>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Replace the style block — sidebar now 200px, content fills remaining space**

```scss
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

/* 底部状态栏 */
.app-footer {
  height: var(--billadm-size-footer-height);
  background-color: var(--billadm-color-major-warm);
  flex-shrink: 0;
  border-top: 1px solid var(--billadm-color-divider);
}
</style>
```

- [ ] **Step 3: Run build to verify Layout.vue compiles**

```bash
cd app && npm run build
```

Expected: Build passes (AppLeftBar and AppTopBar may have errors until their tasks are done — that's fine).

- [ ] **Step 4: Commit**

```bash
git add app/src/components/Layout.vue
git commit -m "refactor: restructure Layout to sidebar + content, remove header"
```

---

### Task 2: Rewrite AppTopBar.vue (Floating Window Controls)

**Files:**
- Modify: `app/src/components/AppTopBar.vue`

- [ ] **Step 1: Replace entire file — floating control buttons only**

```vue
<template>
  <div class="window-controls">
    <button class="window-btn" @click="onMinimize" aria-label="最小化" title="最小化">
      <LineOutlined />
    </button>
    <button class="window-btn" @click="onMaximize" aria-label="最大化" title="最大化">
      <BorderOutlined />
    </button>
    <button class="window-btn window-btn--close" @click="onClose" aria-label="关闭" title="关闭">
      <CloseOutlined />
    </button>
  </div>
</template>

<script setup lang="ts">
import { BorderOutlined, CloseOutlined, LineOutlined } from "@ant-design/icons-vue";

const onMinimize = () => {
  window.electronAPI.minimizeWindow();
}

const onMaximize = () => {
  window.electronAPI.maximizeWindow();
}

const onClose = () => {
  window.electronAPI.closeWindow();
}
</script>

<style scoped>
.window-controls {
  position: absolute;
  top: 12px;
  right: 12px;
  display: flex;
  gap: 6px;
  z-index: 100;
  -webkit-app-region: no-drag;
}

.window-btn {
  width: 32px;
  height: 32px;
  border: none;
  background: rgba(0, 0, 0, 0.04);
  border-radius: var(--billadm-radius-md);
  color: var(--billadm-color-icon);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  transition: all var(--billadm-transition-fast);
}

.window-btn:hover {
  background: var(--billadm-color-hover-bg);
  color: var(--billadm-color-text-major);
}

.window-btn--close:hover {
  background: rgba(217, 112, 90, 0.12);
  color: var(--billadm-color-expense);
}
</style>
```

- [ ] **Step 2: Run build to verify**

```bash
cd app && npm run build
```

Expected: Build passes.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/AppTopBar.vue
git commit -m "refactor: convert AppTopBar to floating window controls"
```

---

### Task 3: Rewrite AppLeftBar.vue (200px Sidebar with Ledger Switcher)

**Files:**
- Modify: `app/src/components/AppLeftBar.vue`

- [ ] **Step 1: Replace entire file — ledger dropdown, icon+text nav, settings at bottom**

```vue
<template>
  <div class="app-left-bar">
    <!-- 顶部：账本切换 -->
    <div class="sidebar-ledger">
      <a-dropdown :trigger="['click']" placement="bottomLeft">
        <button class="ledger-btn">
          <FolderOutlined class="ledger-btn-icon" />
          <span class="ledger-btn-name">{{ ledgerStore.currentLedgerName || '选择账本' }}</span>
          <DownOutlined class="ledger-btn-arrow" />
        </button>
        <template #overlay>
          <div class="ledger-menu">
            <div class="ledger-menu-item ledger-menu-create" @click="handleCreateLedger">
              <PlusOutlined />
              <span>创建账本</span>
            </div>
            <a-divider style="margin: 4px 0" />
            <div
              v-for="ledger in ledgerStore.ledgers"
              :key="ledger.id"
              class="ledger-menu-item"
              :class="{ active: ledger.id === ledgerStore.currentLedgerId }"
              @click="ledgerStore.setCurrentLedger(ledger.id)"
            >
              <span class="ledger-menu-name">{{ ledger.name }}</span>
              <a-button
                type="text"
                size="small"
                danger
                class="ledger-menu-delete"
                @click.stop="handleDeleteLedger(ledger.id, ledger.name)"
              >
                <template #icon><DeleteOutlined /></template>
              </a-button>
            </div>
          </div>
        </template>
      </a-dropdown>
    </div>

    <a-divider style="margin: 0" />

    <!-- 中间：导航 -->
    <nav class="sidebar-nav">
      <button
        v-for="item in navItems"
        :key="item.path"
        class="nav-btn"
        :class="{ active: route.path === item.path }"
        @click="navigate(item.path)"
        :aria-label="item.label"
      >
        <component :is="item.icon" class="nav-btn-icon" />
        <span class="nav-btn-text">{{ item.label }}</span>
      </button>
    </nav>

    <div class="sidebar-spacer"></div>

    <a-divider style="margin: 0" />

    <!-- 底部：设置 -->
    <div class="sidebar-bottom">
      <button
        class="nav-btn"
        :class="{ active: route.path === '/settings_view' }"
        @click="navigate('settings_view')"
        aria-label="设置"
      >
        <SettingOutlined class="nav-btn-icon" />
        <span class="nav-btn-text">设置</span>
      </button>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Add the script block**

```typescript
<script setup lang="ts">
import { useRoute, useRouter } from 'vue-router'
import {
  FolderOutlined,
  DownOutlined,
  PlusOutlined,
  DeleteOutlined,
  TagOutlined,
  TransactionOutlined,
  LineChartOutlined,
  StarOutlined,
  SettingOutlined,
} from '@ant-design/icons-vue'
import { useLedgerStore } from '@/stores/ledgerStore'
import { message, Modal } from 'ant-design-vue'

const router = useRouter()
const route = useRoute()
const ledgerStore = useLedgerStore()

const navItems = [
  { path: '/category_tag_view', label: '分类标签', icon: TagOutlined },
  { path: '/tr_view', label: '消费记录', icon: TransactionOutlined },
  { path: '/da_view', label: '数据分析', icon: LineChartOutlined },
  { path: '/key_event_view', label: '关键事件', icon: StarOutlined },
]

const navigate = (path: string) => {
  router.push(path)
}

const handleCreateLedger = () => {
  Modal.info({
    title: '创建账本',
    content: '请在设置 > 工作空间中创建新账本',
    okText: '知道了',
  })
}

const handleDeleteLedger = (id: string, name: string) => {
  Modal.confirm({
    title: '确认删除',
    content: `确定要删除账本「${name}」吗？此操作不可撤销。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    onOk: async () => {
      try {
        await ledgerStore.deleteLedger(id)
        message.success('删除成功')
      } catch {
        message.error('删除失败')
      }
    },
  })
}
</script>
```

- [ ] **Step 3: Add the scoped styles**

```scss
<style scoped>
.app-left-bar {
  display: flex;
  flex-direction: column;
  height: 100%;
  width: 100%;
}

/* 账本切换区域 */
.sidebar-ledger {
  padding: var(--billadm-space-md);
}

.ledger-btn {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  width: 100%;
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  border: 1px solid var(--billadm-color-window-border);
  border-radius: var(--billadm-radius-md);
  background: var(--billadm-color-major-background);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-major);
  transition: all var(--billadm-transition-fast);
}

.ledger-btn:hover {
  border-color: var(--billadm-color-primary);
  background: var(--billadm-color-hover-bg);
}

.ledger-btn-icon {
  font-size: 16px;
  color: var(--billadm-color-primary);
  flex-shrink: 0;
}

.ledger-btn-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.ledger-btn-arrow {
  font-size: 10px;
  color: var(--billadm-color-text-secondary);
  flex-shrink: 0;
}

/* 下拉菜单 */
.ledger-menu {
  min-width: 180px;
  padding: var(--billadm-space-xs);
  background: var(--billadm-color-major-background);
  border-radius: var(--billadm-radius-md);
  box-shadow: var(--billadm-shadow-lg);
}

.ledger-menu-item {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  border-radius: var(--billadm-radius-sm);
  cursor: pointer;
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-major);
  transition: background var(--billadm-transition-fast);
}

.ledger-menu-item:hover {
  background: var(--billadm-color-hover-bg);
}

.ledger-menu-item.active {
  background: var(--billadm-color-active-bg);
  color: var(--billadm-color-primary);
  font-weight: 500;
}

.ledger-menu-create {
  color: var(--billadm-color-primary);
  font-weight: 500;
}

.ledger-menu-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ledger-menu-delete {
  opacity: 0;
  transition: opacity var(--billadm-transition-fast);
}

.ledger-menu-item:hover .ledger-menu-delete {
  opacity: 1;
}

/* 导航 */
.sidebar-nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--billadm-space-sm);
}

.sidebar-spacer {
  flex: 1;
}

.sidebar-bottom {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--billadm-space-sm);
}

/* 导航按钮 */
.nav-btn {
  display: flex;
  align-items: center;
  gap: var(--billadm-space-sm);
  width: 100%;
  padding: var(--billadm-space-sm) var(--billadm-space-md);
  border: none;
  background: none;
  border-radius: var(--billadm-radius-md);
  cursor: pointer;
  font-family: inherit;
  font-size: var(--billadm-size-text-body-sm);
  color: var(--billadm-color-text-secondary);
  text-align: left;
  transition: all var(--billadm-transition-fast);
}

.nav-btn:hover {
  background-color: var(--billadm-color-hover-bg);
  color: var(--billadm-color-text-major);
}

.nav-btn.active {
  background-color: var(--billadm-color-active-bg);
  color: var(--billadm-color-primary);
  font-weight: 500;
}

.nav-btn-icon {
  font-size: 18px;
  flex-shrink: 0;
  width: 20px;
  text-align: center;
}

.nav-btn-text {
  white-space: nowrap;
}
</style>
```

- [ ] **Step 4: Run build to verify**

```bash
cd app && npm run build
```

Expected: Build passes (may warn about CategoryTagView not existing yet — that's Task 5).

- [ ] **Step 5: Commit**

```bash
git add app/src/components/AppLeftBar.vue
git commit -m "refactor: rewrite AppLeftBar with ledger dropdown and icon+text navigation"
```

---

### Task 4: Update Router

**Files:**
- Modify: `app/src/router/router.ts`

- [ ] **Step 1: Remove ledger_view route, add category_tag_view route**

```typescript
import {createMemoryHistory, createRouter} from 'vue-router';
import Layout from "@/components/Layout.vue";

const routes = [
  {
    path: '/',
    component: Layout,
    children: [
      {path: '', redirect: '/tr_view'},
      {
        name: '分类标签',
        path: 'category_tag_view',
        component: () => import('@/components/category_tag_view/CategoryTagView.vue')
      },
      {
        name: '消费记录',
        path: 'tr_view',
        component: () => import('@/components/tr_view/TransactionRecordView.vue')
      },
      {
        name: '数据分析',
        path: 'da_view',
        component: () => import('@/components/da_view/DataAnalysisView.vue')
      },
      {
        name: '关键事件',
        path: 'key_event_view',
        component: () => import('@/components/key_event_view/KeyEventView.vue')
      },
      {
        name: '应用设置',
        path: 'settings_view',
        component: () => import('@/components/settings_view/SettingsView.vue')
      },
    ]
  }
];

const router = createRouter({
  history: createMemoryHistory(),
  routes,
});

export default router;
```

- [ ] **Step 2: Run build to verify**

```bash
cd app && npm run build
```

Expected: Build fails — CategoryTagView.vue doesn't exist yet. This is expected, proceed to Task 5.

- [ ] **Step 3: Commit**

```bash
git add app/src/router/router.ts
git commit -m "refactor: update router — remove ledger_view, add category_tag_view"
```

---

### Task 5: Create CategoryTagView.vue

**Files:**
- Create: `app/src/components/category_tag_view/CategoryTagView.vue`

- [ ] **Step 1: Create the directory**

```bash
mkdir -p app/src/components/category_tag_view
```

- [ ] **Step 2: Write CategoryTagView.vue — simple wrapper around BilladmCategoryTagSetting**

```vue
<template>
  <div class="category-tag-view">
    <BilladmCategoryTagSetting />
  </div>
</template>

<script setup lang="ts">
import BilladmCategoryTagSetting from '@/components/settings_view/BilladmCategoryTagSetting.vue'
</script>

<style scoped>
.category-tag-view {
  height: 100%;
  overflow-y: auto;
  padding: var(--billadm-space-lg);
  background: var(--billadm-color-major-background);
}
</style>
```

- [ ] **Step 3: Run build to verify**

```bash
cd app && npm run build
```

Expected: Build passes.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/category_tag_view/CategoryTagView.vue
git commit -m "feat: add CategoryTagView — extracted category/tag management page"
```

---

### Task 6: Update SettingsView — Remove Category/Tag Section

**Files:**
- Modify: `app/src/components/settings_view/SettingsView.vue`

- [ ] **Step 1: Remove the category-tag nav item from the template**

Remove these lines from the template:
```html
        <button
          class="nav-item"
          :class="{ active: activeComponent === 'category-tag' }"
          @click="activeComponent = 'category-tag'"
          aria-label="分类与标签"
        >
          <TagOutlined class="nav-icon"/>
          <span class="nav-text">分类与标签</span>
        </button>
```

- [ ] **Step 2: Update the script — remove TagOutlined import, CategoryTagSetting import, update default activeComponent**

```typescript
import { ref, computed } from 'vue';
import {
  FolderOpenOutlined,
  FileTextOutlined,
  InfoCircleOutlined
} from "@ant-design/icons-vue";
import WorkspaceSetting from './WorkspaceSetting.vue';
import BilladmTemplateSetting from './BilladmTemplateSetting.vue';
import AboutSetting from './AboutSetting.vue';

const activeComponent = ref('workspace');

const componentMap = {
  'workspace': WorkspaceSetting,
  'template': BilladmTemplateSetting,
  'about': AboutSetting,
};

const currentComponent = computed(() => {
  return componentMap[activeComponent.value as keyof typeof componentMap] || null;
});
```

- [ ] **Step 3: Run build to verify**

```bash
cd app && npm run build
```

Expected: Build passes.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/settings_view/SettingsView.vue
git commit -m "refactor: remove category/tag section from SettingsView (moved to CategoryTagView)"
```

---

### Task 7: Delete Unused Files

**Files:**
- Delete: `app/src/components/ledger_view/LedgerView.vue`
- Delete: `app/src/components/BilladmLedgerSelect.vue`

- [ ] **Step 1: Delete the files**

```bash
rm app/src/components/ledger_view/LedgerView.vue
rm app/src/components/BilladmLedgerSelect.vue
```

Check if the ledger_view directory is now empty:
```bash
ls app/src/components/ledger_view/
```

If empty, remove the directory:
```bash
rmdir app/src/components/ledger_view/
```

- [ ] **Step 2: Run build to verify**

```bash
cd app && npm run build
```

Expected: Build passes. `vue-tsc` type-checks and `vite build` bundles without errors.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove unused LedgerView and BilladmLedgerSelect components"
```

---

### Task 8: Final Verification Build

- [ ] **Step 1: Clean build**

```bash
cd app && npm run build
```

Expected: Zero errors, zero warnings (chunk size warnings are OK).

- [ ] **Step 2: Verify route navigation works**

Check router.ts has all expected routes:
- `/category_tag_view` → CategoryTagView
- `/tr_view` → TransactionRecordView
- `/da_view` → DataAnalysisView
- `/key_event_view` → KeyEventView
- `/settings_view` → SettingsView

No `/ledger_view` route remains.

- [ ] **Step 3: Final commit if any remaining changes**

```bash
git status
# If clean, done. If not, add and commit remaining changes.
```
