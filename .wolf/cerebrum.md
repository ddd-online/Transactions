# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-06-25

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** Transactions
- **Description:** 一款桌面端记账工具
- **HEIC/浏览器兼容性:** Chromium 和所有主流浏览器均不支持 HEIC 原生渲染（专利格式）。要在 Electron 应用中显示 HEIC 图片，必须在客户端用 `heic2any` 解码转换，或在服务端用 libheif 转换。本项目采用前端方案（`heic2any`），避免 Go 后端引入 CGO 依赖。
- **heic2any × Vite 兼容性:** `heic2any` 是 UMD 模块（内嵌 WASM + Web Worker）。正确加载方式：① `optimizeDeps.include: ['heic2any']` 让 Vite/esbuild 正常预构建（esbuild 不会破坏字符串字面量或 Worker 代码）；② 使用**动态 import**：`const heic2any = (await import('heic2any')).default`（避免静态 import 的模块解析时机问题）；③ 生产构建 `manualChunks` 隔离。**错误认知已纠正：** `optimizeDeps.exclude` 是错误方案——它阻止了 CJS→ESM 互操作，导致 `.default` 为 undefined。

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
