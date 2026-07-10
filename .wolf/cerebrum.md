# Cerebrum

> OpenWolf's learning memory. Updated automatically as the AI learns from interactions.
> Do not edit manually unless correcting an error.
> Last updated: 2026-06-25

## User Preferences

<!-- How the user likes things done. Code style, tools, patterns, communication. -->

## Key Learnings

- **Project:** Transactions
- **Description:** 一款桌面端记账工具
- **HEIC/浏览器兼容性:** Chromium 和所有主流浏览器均不支持 HEIC 原生渲染（专利格式）。要在 Electron 应用中显示 HEIC 图片，必须在客户端用 HEIC 解码库转换。**最终方案：`heic-to`（libheif 1.22.2）**，持续跟进 libheif 上游，支持最新 iPhone HEIC 格式。旧方案 `heic2any@0.0.4` 的 libheif 过老，不支持新版 iPhone 的 HEIC 变体（ERR_LIBHEIF format not supported）。
- **`heic-to` × Vite 使用方式:** `heic-to` 是纯 ESM 模块（有 CSP 安全变体 `heic-to/csp`）。加载方式：① `optimizeDeps.include: ['heic-to']`；② 动态 import：`const { heicTo } = await import('heic-to/csp')`；③ 生产 `manualChunks: { 'vendor-heic': ['heic-to'] }`。API：`heicTo({ blob: file, type: 'image/jpeg', quality: 0.92 })` 返回 `Promise<Blob>`（始终单张，无 `multiple` 选项）。

## Do-Not-Repeat

- [2026-06-26] **不要用 `heic2any`（v0.0.4）**——内嵌 libheif 太老，不支持新版 iPhone HEIC，报 `ERR_LIBHEIF format not supported`。用 `heic-to`（libheif 1.22.2+）。
- [2026-06-26] **Vite 中 UMD 模块不要用 `optimizeDeps.exclude`**——会阻止 CJS→ESM 互操作，导致 `default` 导出为 undefined。正确做法是正常预构建 + 动态 import。
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
- [2026-07-10] **Electron 中网络请求走代理：用 `net` 模块，不要用 `https`。** Node.js `https` 模块绕过系统代理，导致 VPN/系统代理无法加速 GitHub 下载。Electron `net.request()` 基于 Chromium 网络栈，自动跟随系统代理设置（HTTP/SOCKS/TUN 均生效）。API 差异：`https.get(url, opts, cb)` → `net.request({ method, url })` + `req.on('response', cb)` + `req.end()`。取消方式：`AbortController` → 直接存 `req` 引用，`req.destroy()`。
