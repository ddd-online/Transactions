# Settings Page Fixed Header

## Problem

设置页面的子页面（通用、消费模板、日记配置、智能助手）标题随内容滚动消失。当页面内容较长时（如智能助手），滚动到底部后标题不可见。

根因：`.settings-content { overflow-y: auto }` 使整个内容区（含标题）一起滚动。

## Solution

新建 `SettingsPageWrapper` 组件，将标题固定在顶部，仅内容区滚动。每个设置子页面（除关于页）使用该组件包裹。

### Architecture

```
SettingsView.vue (.settings-content: overflow: hidden)
└── .content-inner (height: 100%, no padding)
    └── <component :is="currentComponent" />
        ├── GeneralSetting    → SettingsPageWrapper(title="通用")
        ├── BilladmTemplateSetting → SettingsPageWrapper(title="消费模板")
        ├── DiarySetting      → SettingsPageWrapper(title="日记配置")
        ├── AiSetting         → SettingsPageWrapper(title="智能助手")
        └── AboutSetting      → 不改动
```

### New Component: `SettingsPageWrapper`

```
┌─────────────────────────────────────────┐
│ .settings-page-wrapper (h:100%, flex col) │
│ ┌───────────────────────────────────────┐│
│ │ .page-header (flex-shrink:0)          ││  ← 固定标题区
│ │   title + slot:extra                  ││
│ └───────────────────────────────────────┘│
│ ┌───────────────────────────────────────┐│
│ │ .page-body (flex:1, overflow-y:auto)  ││  ← 可滚动内容区
│ │   padding: md lg                      ││     (带 padding)
│ │   <slot />                            ││
│ └───────────────────────────────────────┘│
└─────────────────────────────────────────┘
```

- **Props**: `title: string`
- **Slots**: `extra`（头部右侧额外内容）、`default`（主体内容）
- **Style**: 复用现有 `BilladmPageHeader` 样式 token

### Changes

| File | Change |
|------|--------|
| **NEW** `app/src/components/common/SettingsPageWrapper.vue` | 新建包裹组件 |
| `app/src/components/settings_view/SettingsView.vue` | `.settings-content`: `overflow-y: auto` → `overflow: hidden`；`.content-inner`: 去掉 `padding` |
| `app/src/components/settings_view/GeneralSetting.vue` | 移除 `<BilladmPageHeader>`，用 `<SettingsPageWrapper title="通用">` 包裹 |
| `app/src/components/settings_view/AiSetting.vue` | 同上，title="智能助手" |
| `app/src/components/settings_view/DiarySetting.vue` | 同上，title="日记配置" |
| `app/src/components/settings_view/BilladmTemplateSetting.vue` | 同上，title="消费模板"，内部表格独立滚动不变 |
| `app/src/components/settings_view/AboutSetting.vue` | 不改动 |

### Non-goals

- 不改动 `BilladmPageHeader` 组件
- 不改动关于页面的布局
- 不修改后端/API

### Edge Cases

- **消费模板页**: `template-table-wrapper` 已有的 `flex: 1; overflow: auto` 保持不变，表格仍可独立滚动
- **日记配置页**: 文件列表 `max-height: 280px` 内部滚动保持不变
- **关于页**: 无标题、居中布局，不使用 wrapper，维持现状
- **组件切换**: 切换设置子页面时，wrapper 的 body 滚动位置应自然重置（通过 `:key` 或组件重建实现）

### Design System Compliance

- 使用现有 CSS 变量（`--billadm-size-text-title-sm`、`--billadm-space-*`）
- 滚动条使用 `@include custom-scrollbar` mixin
- 遵循 DESIGN.md 约束（flat-by-default、teal accent）
