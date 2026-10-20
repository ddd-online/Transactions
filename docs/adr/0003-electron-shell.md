# ADR 0003：Electron + React + TypeScript 全量重写

## 背景

0.20.0 是 Tauri 2 外壳 + Rust 内核（约 6.8 万行）+ Leptos/WASM 界面（约 2.8 万行）。
产品决定迁移到 Electron，并且**不再保留 Rust**：新仓库、新发布渠道、一次性导入旧数据。

## 决策

- 外壳：Electron 44.9.1（M0 钉死），`electron-vite` 6 构建 main/preload/renderer。
- 界面：React 19 + TypeScript strict + Vite 7；**样式、类名、DOM 结构与 aria 名尽量 1:1 复用**
  （`src/styles` 从旧仓库原样拷贝），不在迁移期重新设计界面。
- 状态：TanStack Query（IPC 取数）+ Zustand（页面/账本/开关/通知）——M1 接入。
- 依赖原则：不引原生模块；HEIC 解码、缩略图、Markdown 都走纯 JS/WASM。
- 测试：Vitest + Playwright（`_electron`），不再依赖 PowerShell UIA。
- 发布：electron-builder NSIS（当前用户、简体中文）+ portable；资产名保持
  `Transactions-x64-v{版本}.exe`；自研更新（GitHub Releases + sha256 digest）。
- 版本从 **1.0.0** 起；旧仓库冻结在 0.20.0，避免旧客户端自动升级到不兼容的新应用。

## 后果

- 优点：单一语言栈、渲染调试/测试工具成熟、打包不需要 Rust 工具链、无 WebView2 依赖。
- 代价：安装包体积与内存高于 Tauri；股票/费用/统计等 2 万行业务逻辑需要逐条移植并重跑测试。
- 迁移期旧仓库保留为只读参照（行为与单测的 oracle），不进入新仓库。
