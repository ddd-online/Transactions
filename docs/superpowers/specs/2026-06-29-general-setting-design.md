# 通用设置页 + DevTools 开关 设计规格

> 日期：2026-06-29 | 状态：已确认

## 目的

在设置页面新增"通用"标签页，承载软件常用设置。首期仅含一个设置项：是否打开 DevTools。

## UI 设计

### 布局

```
┌─ 设置页 ──────────────────────────────────────┐
│  ┌─左侧导航─┐  ┌─右侧内容区──────────────────┐ │
│  │ 工作空间   │  │  ┌─ 设置卡片 ─────────────┐ │ │
│  │ 消费模板   │  │  │  开发者工具            │ │ │
│  │ 通用  ←新  │  │  │  打开 Chromium        │ │ │
│  │ 关于      │  │  │  DevTools 用于         │ │ │
│  │          │  │  │  调试前端代码  [开关]   │ │ │
│  │          │  │  └────────────────────────┘ │ │
│  └──────────┘  └─────────────────────────────┘ │
└────────────────────────────────────────────────┘
```

### 设置卡片

- 整行卡片式布局
- 左侧：标题 + 简短描述
- 右侧：操作区（开关按钮）
- 样式继承项目 CSS 变量体系

## 架构

```
SettingsView.vue          ← 新增"通用"导航项 + 组件注册
  └── GeneralSetting.vue  ← 新增组件
        └── 设置项卡片

electron/src/main.js      ← 新增 IPC: devtools:toggle
electron/src/preload.js   ← 新增 toggleDevTools 桥接
```

## IPC 调用链

```
[开关点击] → preload.toggleDevTools(enabled)
           → main: devtools:toggle
           → mainWindow.webContents.toggleDevTools()
```

## 行为矩阵

| 操作 | 结果 |
|------|------|
| 打开开关 | 主窗口右侧打开 DevTools |
| 关闭开关 | 关闭 DevTools |
| DevTools 通过其他方式关闭 | 无回调处理（不做双向同步） |

## 修改范围

### 新增文件
- `app/src/components/settings_view/GeneralSetting.vue`

### 修改文件
- `app/src/components/settings_view/SettingsView.vue` — 导航项 + 组件注册
- `electron/src/main.js` — 新增 `devtools:toggle` IPC handler
- `electron/src/preload.js` — 新增 `toggleDevTools` 桥接

## 不做

- 不持久化开关状态
- 不在非 Electron 环境中显示
- 不在 DevTools 被手动关闭时反向同步开关
- 首期不添加其他设置项
