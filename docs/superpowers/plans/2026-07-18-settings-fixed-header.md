# Settings Page Fixed Header Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新建 `SettingsPageWrapper` 组件，使设置子页面的标题固定在顶部不随内容滚动，内容区独立滚动并带 padding。

**Architecture:** 新建 `SettingsPageWrapper.vue` 包裹组件（固定标题 + 可滚动内容区），修改 4 个设置子页面移除 `<BilladmPageHeader>` 改用 wrapper 包裹，修改 `SettingsView.vue` 将外层滚动改为内层各子页面独立滚动。

**Tech Stack:** Vue 3 + TypeScript + SCSS (CSS variables via `--billadm-*` tokens)

## Global Constraints

- 使用现有 `--billadm-*` CSS 变量
- 滚动条使用 `@include custom-scrollbar` mixin（来自 `_mixins.scss`）
- `BilladmPageHeader` 组件不改动
- AboutSetting 不改动（维持居中有局）
- 无后端/API 变动

---

### Task 1: 创建 SettingsPageWrapper 组件

**Files:**
- Create: `app/src/components/common/SettingsPageWrapper.vue`

**Interfaces:**
- Produces: `<SettingsPageWrapper title="..." />` 组件，可选 slot `extra`

- [ ] **Step 1: 创建组件文件**

```vue
<!-- app/src/components/common/SettingsPageWrapper.vue -->
<template>
  <div class="settings-page-wrapper">
    <BilladmPageHeader :title="title">
      <template v-if="$slots.extra" #extra>
        <slot name="extra" />
      </template>
    </BilladmPageHeader>
    <div class="page-body">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import BilladmPageHeader from '@/components/common/BilladmPageHeader.vue'

defineProps<{
  title: string
}>()
</script>

<style scoped lang="scss">
@use '@/styles/mixins' as *;

.settings-page-wrapper {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--billadm-space-md) var(--billadm-space-lg) 0;
}

.page-body {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding-bottom: var(--billadm-space-md);

  @include custom-scrollbar;
}
</style>
```

- [ ] **Step 2: 提交**

```bash
git add app/src/components/common/SettingsPageWrapper.vue
git commit -m "feat: add SettingsPageWrapper component for fixed settings header"
```

---

### Task 2: 修改 SettingsView.vue — 禁用外层滚动

**Files:**
- Modify: `app/src/components/settings_view/SettingsView.vue:182-196`

**Interfaces:**
- Consumes: `SettingsPageWrapper` 组件（Task 1）提供子页面滚动
- Produces: `.settings-content` 不再滚动，`.content-inner` 不再有 padding

- [ ] **Step 1: 修改 `.settings-content` 和 `.content-inner` 样式**

在 `SettingsView.vue` 的 `<style scoped>` 部分：

将行 182-183:
```css
.settings-content {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  background-color: var(--billadm-color-major-warm);
}
```

改为:
```css
.settings-content {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow: hidden;
  background-color: var(--billadm-color-major-warm);
}
```

将行 190-195:
```css
.content-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: var(--billadm-space-md) var(--billadm-space-lg);
}
```

改为:
```css
.content-inner {
  height: 100%;
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 2: 提交**

```bash
git add app/src/components/settings_view/SettingsView.vue
git commit -m "fix: disable outer scroll on settings content area"
```

---

### Task 3: 修改 GeneralSetting.vue — 使用 SettingsPageWrapper

**Files:**
- Modify: `app/src/components/settings_view/GeneralSetting.vue`

**Interfaces:**
- Consumes: `SettingsPageWrapper`（Task 1）
- Produces: 使用 wrapper 包裹，移除手动导入的 `BilladmPageHeader`

- [ ] **Step 1: 替换模板**

模板中的第 2-3 行：
```html
  <div class="general-setting">
    <BilladmPageHeader title="通用" />
```

和结尾的第 41 行：
```html
  </div>
```

整体替换为（保留内容，去掉外层 div 和 header）：
```html
  <SettingsPageWrapper title="通用">
```

并在模板最后将 `</div>` 改为 `</SettingsPageWrapper>`：
```html
  </SettingsPageWrapper>
```

- [ ] **Step 2: 移除 BilladmPageHeader 导入**

将第 46 行：
```typescript
import BilladmPageHeader from '@/components/common/BilladmPageHeader.vue'
```

删除。

- [ ] **Step 3: 移除 `.general-setting` 样式**

将第 79-83 行：
```css
.general-setting {
  height: 100%;
  display: flex;
  flex-direction: column;
}
```

删除。

- [ ] **Step 4: 提交**

```bash
git add app/src/components/settings_view/GeneralSetting.vue
git commit -m "refactor: GeneralSetting uses SettingsPageWrapper"
```

---

### Task 4: 修改 AiSetting.vue — 使用 SettingsPageWrapper

**Files:**
- Modify: `app/src/components/settings_view/AiSetting.vue`

**Interfaces:**
- Consumes: `SettingsPageWrapper`（Task 1）
- Produces: 使用 wrapper 包裹，移除手动导入的 `BilladmPageHeader`

- [ ] **Step 1: 替换模板**

将第 2-3 行：
```html
  <div class="ai-setting">
    <BilladmPageHeader title="智能助手" />
```

替换为：
```html
  <SettingsPageWrapper title="智能助手">
```

将第 235 行的 `  </div>` 替换为：
```html
  </SettingsPageWrapper>
```

- [ ] **Step 2: 移除 BilladmPageHeader 导入**

删除第 240 行：
```typescript
import BilladmPageHeader from '@/components/common/BilladmPageHeader.vue'
```

- [ ] **Step 3: 移除 `.ai-setting` 样式**

将第 552-556 行：
```css
.ai-setting {
  height: 100%;
  display: flex;
  flex-direction: column;
}
```

删除。

- [ ] **Step 4: 提交**

```bash
git add app/src/components/settings_view/AiSetting.vue
git commit -m "refactor: AiSetting uses SettingsPageWrapper"
```

---

### Task 5: 修改 DiarySetting.vue — 使用 SettingsPageWrapper

**Files:**
- Modify: `app/src/components/settings_view/DiarySetting.vue`

**Interfaces:**
- Consumes: `SettingsPageWrapper`（Task 1）
- Produces: 使用 wrapper 包裹，移除手动导入的 `BilladmPageHeader`

- [ ] **Step 1: 替换模板**

将第 2-3 行：
```html
  <div class="diary-setting">
    <BilladmPageHeader title="日记配置" />
```

替换为：
```html
  <SettingsPageWrapper title="日记配置">
```

将第 96 行的 `</div>` 替换为：
```html
  </SettingsPageWrapper>
```

- [ ] **Step 2: 移除 BilladmPageHeader 导入**

删除第 103 行：
```typescript
import BilladmPageHeader from '@/components/common/BilladmPageHeader.vue'
```

- [ ] **Step 3: 移除 `.diary-setting` 样式**

将第 236-240 行：
```css
.diary-setting {
  height: 100%;
  display: flex;
  flex-direction: column;
}
```

删除。

- [ ] **Step 4: 提交**

```bash
git add app/src/components/settings_view/DiarySetting.vue
git commit -m "refactor: DiarySetting uses SettingsPageWrapper"
```

---

### Task 6: 修改 BilladmTemplateSetting.vue — 使用 SettingsPageWrapper

**Files:**
- Modify: `app/src/components/settings_view/BilladmTemplateSetting.vue`

**Interfaces:**
- Consumes: `SettingsPageWrapper`（Task 1）
- Produces: 使用 wrapper 包裹，内部表格独立滚动通过 wrapper body 的 flex column 保持

- [ ] **Step 1: 替换模板**

将第 2-3 行：
```html
  <div class="template-setting">
    <BilladmPageHeader title="消费模板" />
```

替换为：
```html
  <SettingsPageWrapper title="消费模板">
```

将第 70 行的 `  </div>` 替换为：
```html
  </SettingsPageWrapper>
```

- [ ] **Step 2: 移除 `.template-setting` 样式**

将第 242-246 行：
```css
.template-setting {
  height: 100%;
  display: flex;
  flex-direction: column;
}
```

删除。

- [ ] **Step 3: 提交**

```bash
git add app/src/components/settings_view/BilladmTemplateSetting.vue
git commit -m "refactor: BilladmTemplateSetting uses SettingsPageWrapper"
```

---

### Task 7: 验证 — TypeScript 类型检查

**Files:**
- (无文件改动，仅运行验证命令)

- [ ] **Step 1: 运行 Vue 类型检查**

```bash
cd app && npx vue-tsc -b
```

预期：无类型错误，clean exit。

---

## Summary

| Task | 文件 | 操作 |
|------|------|------|
| 1 | `components/common/SettingsPageWrapper.vue` | 新建 |
| 2 | `settings_view/SettingsView.vue` | CSS: overflow + padding |
| 3 | `settings_view/GeneralSetting.vue` | 模板重构 |
| 4 | `settings_view/AiSetting.vue` | 模板重构 |
| 5 | `settings_view/DiarySetting.vue` | 模板重构 |
| 6 | `settings_view/BilladmTemplateSetting.vue` | 模板重构 |
| 7 | — | 类型检查验证 |
