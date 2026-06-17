# Layout Restructuring Design

**Date:** 2026-06-17
**Status:** Approved

## Overview

Restructure the app layout from a top-bar + narrow-icon-sidebar design to a wider left sidebar (200px) with integrated ledger management, icon+text navigation, and immersive floating window controls.

## Before → After

```
BEFORE:                              AFTER:
┌──────────────────────────────┐    ┌──────────┬───────────────────────┐
│ AppTopBar (title + min/max/x)│    │ Sidebar  │ Content        [—][□][×]│
├────┬─────────────────────────┤    │          │                        │
│ ══ │ Content                 │    │ Ledger ▼ │  <router-view />      │
│ ══ │                         │    │ ──────── │                        │
│    │                         │    │ 📂 分类  │                        │
│    │                         │    │ 💰 消费  │                        │
│    │                         │    │ 📊 分析  │                        │
│    │                         │    │ ⭐ 事件  │                        │
│    │                         │    │          │                        │
│    │                         │    │ ⚙ 设置   │                        │
└────┴─────────────────────────┘    └──────────┴───────────────────────┘
```

## Left Sidebar (200px)

### Top: Ledger Switcher
- Button displays current ledger name
- Click opens a dropdown menu:
  - "+ 创建账本" action at top
  - Divider
  - Ledger list: each item shows ledger name + delete icon
  - Click ledger name → switch to that ledger
  - Click delete icon → confirm and delete

### Middle: Navigation (4 items)
Each nav item: icon + text label, highlights when active
1. 分类标签 → `/category_tag_view` (new route)
2. 消费记录 → `/tr_view`
3. 数据分析 → `/da_view`
4. 关键事件 → `/key_event_view`

### Bottom: Settings
- ⚙ 设置 → `/settings_view`

## Right Content Area

### Floating Window Controls
- Position: `absolute; top: 12px; right: 12px;`
- Three buttons: minimize, maximize, close
- Semi-transparent background, fully opaque on hover
- `z-index` above content, no layout impact

### Content
- Standard `<router-view />` for page rendering

## Route Changes

| Action | Path | Component |
|--------|------|-----------|
| REMOVE | `/ledger_view` | LedgerView.vue (delete file) |
| ADD | `/category_tag_view` | CategoryTagView.vue (new, extracted from settings) |
| KEEP | `/tr_view` | TransactionRecordView.vue |
| KEEP | `/da_view` | DataAnalysisView.vue |
| KEEP | `/key_event_view` | KeyEventView.vue |
| KEEP | `/settings_view` | SettingsView.vue |

## Component Changes

| File | Action | Description |
|------|--------|-------------|
| `Layout.vue` | Rewrite | Remove header, restructure to sidebar + content with floating controls |
| `AppLeftBar.vue` | Rewrite | Expand to 200px, add ledger dropdown with full CRUD, icon+text nav, settings at bottom |
| `AppTopBar.vue` | Rewrite | Change from full title bar to floating window control buttons only |
| `LedgerView.vue` | Delete | Ledger management now in sidebar |
| `BilladmLedgerSelect.vue` | Delete | No longer needed |
| `CategoryTagView.vue` | Create | New page — extract category/tag management from SettingsView |
| `router.ts` | Update | Remove ledger_view route, add category_tag_view route |
| `SettingsView.vue` | Update | Remove category/tag section (moved to CategoryTagView) |
| `TransactionRecordView.vue` | Update | Remove any ledger selector if present |
| `DataAnalysisView.vue` | Update | Remove any ledger selector if present |

## Data Flow

- `LedgerStore` remains the central ledger state (already exists, no changes needed)
- Sidebar reads `ledgerStore.currentLedgerName` for the button label
- Sidebar calls `ledgerStore.createLedger()`, `ledgerStore.deleteLedger()`, `ledgerStore.setCurrentLedger()`
- Navigation uses existing `vue-router` (no changes to routing mechanism)

## Non-Goals

- No changes to backend/kernel
- No changes to Electron main process
- No changes to remaining views (LedgerView removed, others stay the same)
- SettingsView keeps all sections except category/tag management
