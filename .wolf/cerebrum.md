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
- **heic2any × Vite 兼容性:** `heic2any` 内嵌 WASM (libheif) + 通过 Blob URL 创建内联 Web Worker。Vite 的 esbuild 预构建会破坏这两者，必须在 `vite.config.ts` 中配置 `optimizeDeps.exclude: ['heic2any']`，并在 `build.rollupOptions` 中设置 `manualChunks` 隔离。同时，排除预构建后 UMD 模块的 `export default` 在 Vite dev mode 下不可用，必须改为**动态 import + CJS/ESM 互操作**：`const m = await import('heic2any'); const heic2any = m.default || m`。

## Do-Not-Repeat

- [2026-06-26] 在 Vite 项目中使用内嵌 WASM/Worker 的 UMD 模块（如 heic2any）时：① 必须在 `vite.config.ts` 中 `optimizeDeps.exclude` 排除；② 不能使用静态 `import xxx from 'xxx'`，必须用动态 `await import('xxx')` + CJS/ESM 互操作（`m.default || m`）；③ 生产构建需设置 `manualChunks` 隔离。三步缺一不可，否则分别在预构建、dev 模式运行、生产构建中失败。

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
