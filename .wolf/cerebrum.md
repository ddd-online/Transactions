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

## Do-Not-Repeat

<!-- Mistakes made and corrected. Each entry prevents the same mistake recurring. -->
<!-- Format: [YYYY-MM-DD] Description of what went wrong and what to do instead. -->

## Decision Log

<!-- Significant technical decisions with rationale. Why X was chosen over Y. -->
