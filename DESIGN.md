---
name: Transactions
description: A calm, restrained personal finance desktop app in the DeepSeek Harness visual language — cool neutrals, DeepSeek blue, light & dark themes
colors:
  primary: "#3964fe"
  primary-hover: "#5b7fff"
  primary-active: "#2b52e6"
  primary-200: "#a9bdff"
  accent: "#d97706"
  bg-base-light: "#f9fafb"
  surface-light: "#ffffff"
  sidebar-fill-light: "#f3f4f6"
  border-l1-light: "#e8eaed"
  text-primary-light: "#0f1115"
  text-secondary-light: "#61666b"
  text-tertiary-light: "#81858c"
  bg-base-dark: "#0f1115"
  surface-dark: "#16181d"
  elevated-dark: "#1d2026"
  sidebar-fill-dark: "#14161a"
  border-l1-dark: "rgba(255,255,255,0.08)"
  text-primary-dark: "#f2f4f8"
  text-secondary-dark: "#b6bcc6"
  text-tertiary-dark: "#8a919c"
  income: "#16a34a"
  expense: "#dc2626"
  transfer: "#3b82f6"
  outlier: "#d97706"
  income-dark: "#4ade80"
  expense-dark: "#f87171"
  transfer-dark: "#60a5fa"
  outlier-dark: "#fbbf24"
  ledger-forest: "#4a8e70"
  ledger-warm-brown: "#8c7b6e"
  ledger-amber: "#c6963a"
  ledger-vermillion: "#d9705a"
  ledger-slate-blue: "#5c8db5"
  ledger-ochre: "#9e8c7e"
  ledger-moss: "#6b9e7e"
  ledger-camel: "#b89a80"
typography:
  display-xl:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "36px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
  display:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: normal
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.04em"
  caption:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
  mono:
    fontFamily: "JetBrains Mono, SF Mono, Consolas, monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "-0.01em"
    fontFeature: "tabular-nums"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  chat: "20px"
  full: "9999px"
spacing:
  "2xs": "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  "2xl": "32px"
  "3xl": "48px"
---

# Design System: Transactions

## Overview

**Creative North Star: "The Quiet Harness"**

Transactions is a calm, restrained personal finance desktop app. The interface serves the task — tracking money — and gets out of the way. The visual language is adopted from the DeepSeek Harness (DSH) Web GUI: cool neutral surfaces, a single DeepSeek blue accent (`#3964fe`), hairline borders, soft shadows, and fast product-paced motion. Warm "ledger" warmth is carried by the data itself — semantic income/expense/transfer colors and the eight-tone ledger identity palette — never by the chrome.

The design strategy is **Restrained with deliberate semantic payload**: DeepSeek blue claims primary actions, focus states, selection and streaming indicators (≤10% of any surface). Semantic colors (income green, expense vermillion, transfer blue, outlier amber) activate only where transaction data lives. The background hierarchy is cool neutral — near-white `#f9fafb` in light, near-black `#0f1115` in dark — with hairline borders for separation and soft shadows only on hover and overlays.

**Key Characteristics:**
- Two appearances: **light / dark / follow-system**, switched in General Settings and persisted in `~/.transactions.json` (`data-theme` on `<html>`, AntD `darkAlgorithm` for component tokens)
- Restrained color: one blue accent, semantic colors only for data
- Inter for UI, JetBrains Mono for numbers — tabular-nums on every amount
- Hairline border layers (l1/l2/l3) + shadow levels (lv1–lv4); flat at rest, lifted on interaction
- 28px pill icon buttons (window controls), 20px chat bubbles and composer
- Custom 5px cool-neutral scrollbar with hover fade-in
- Electron-native: frameless window with custom title bar, drag regions, no OS chrome
- `prefers-reduced-motion` is respected wherever motion exists

## Appearance (Light / Dark / System)

The app ships two themes with identical token names; dark values apply under `[data-theme="dark"]` (set by the appearance store) or, before the store initializes / in the init window, under `@media (prefers-color-scheme: dark)`. The Electron main process mirrors the choice through `nativeTheme.themeSource` so system dialogs and the init window follow.

- **Light:** bg-base `#f9fafb` → surface `#ffffff` → sidebar `#f3f4f6`; text `#0f1115` / `#61666b` / `#81858c`; borders `#e8eaed`/`#e2e4e8`/`#d5d8dd`.
- **Dark:** bg-base `#0f1115` → surface `#16181d` → elevated `#1d2026` → sidebar `#14161a`; text `#f2f4f8` / `#b6bcc6` / `#8a919c`; borders `rgba(255,255,255,.08/.12/.18)`.
- Semantic and ledger colors get lightened dark variants for legibility on dark surfaces.
- Ant Design Vue components are themed through `theme.darkAlgorithm` + the same token values, so popups, tables, pickers and modals never leak light-mode surfaces into dark.

## Colors

The palette is cool and mineral — DeepSeek blue, bluish-grays, near-white/near-black neutrals. No neon, no synthetic saturation, no gradient overlays.

### Primary
- **DeepSeek Blue** (`#3964fe`): primary buttons, focused borders, selected states, tab ink bars, active icon color, checked controls, streaming indicators. Hover `#5b7fff` (light) / `#6b8aff` (dark), active `#2b52e6`. The only color that claims the interactive surface.
- **Blue 200** (`#a9bdff`): light ramp used for shimmers and soft accents.

### Accent
- **Amber** (`#d97706` light / `#fbbf24` dark): warning role — tool-in-progress cards, thinking states, outlier markers. Mapped from DSH's state-warn family.

### Semantic (transaction data only)
- **Income Green** (`#16a34a` / `#4ade80` dark), **Expense Vermillion** (`#dc2626` / `#f87171`), **Transfer Blue** (`#3b82f6` / `#60a5fa`), **Outlier Amber** (`#d97706` / `#fbbf24`). Each ships with a 10% (light) / 14% (dark) tint for tag and row backgrounds.
- UI state colors reuse the same family: success = income green, warning = outlier amber, error = expense vermillion.

### Interactive Tints
- **Hover Fill** (`rgba(15,17,21,.06)` / `rgba(255,255,255,.08)`): neutral hover backgrounds — nav, list rows, icon buttons, dropdown items.
- **Active Fill** (`rgba(57,100,254,.10)` / `rgba(57,100,254,.22)`): selected rows, active nav items, checked dropdown items.
- **Danger Hover** (`rgba(220,38,38,.10)` / `rgba(248,113,113,.14)`): danger hover backgrounds.

### Neutral
- **Light:** Clean White (`#ffffff`) content surfaces; Near-White (`#f9fafb`) page backdrop; Cool Gray (`#f3f4f6`) sidebar and table headers; hairline borders l1/l2/l3; Ink (`#0f1115`) primary text; Slate (`#61666b`) secondary; Muted (`#81858c`) tertiary; Disabled (`#9aa0a8`).
- **Dark:** Near-Black (`#0f1115`) backdrop; Surface (`#16181d`) containers; Elevated (`#1d2026`) popovers; Cool Dark Gray (`#14161a`) sidebar; hairline white borders; text as above.

### Ledger Palette
Eight natural tones give each ledger its own identity: forest, warm brown, amber, vermillion, slate blue, ochre, moss, camel (lightened in dark). Ledger colors may tint that ledger's category tags — identity colors, never navigation or chrome colors.

### Named Rules
**The One Accent Rule.** DeepSeek blue is used on ≤10% of any given screen. Its rarity is the point. Saturation on interactive elements only; never as decoration, never as a background wash.

**The Semantic Silo Rule.** Income/expense/transfer/outlier colors only appear where transaction data lives — tables, tags, amount displays, chart segments, ledger identity. They do not leak into navigation, chrome, or general-purpose UI.

## Typography

**Display/Body Font:** Inter (system-ui fallback) — one sans family across the entire interface.
**Monospace Font:** JetBrains Mono (SF Mono, Consolas fallback) for every monetary value and code.

Hierarchy: Display XL 36px/700 → Display 28px/700 → Display Small 24px/600 → Title 20px/600 → Title Small 18px/600 → Section 16px/500 → Body 14px/400 → Body Small 13px → Caption 12px → Small 11px. Amounts: Amount 20px/500, Amount Large 28px/600, Amount Small 14px/500 — all tabular-nums with negative letter-spacing.

### Named Rules
**The Monospace Money Rule.** Every monetary value — tables, cards, dashboards, forms — uses JetBrains Mono with `font-variant-numeric: tabular-nums`. Never display a financial number in a proportional font.

## Layout

The app is a fixed desktop shell with one scrolling content column. A 200px labeled sidebar (`sidebar-fill`) sits at the left with a hairline right border; the 48px frameless top bar is a drag region with window controls at the right; a 44px statistics footer anchors the transaction views. Content scrolls on `bg-base` with the custom scrollbar.

Spacing follows an 8px base scale: 2 / 4 / 8 / 12 / 16 / 24 / 32 / 48px. Cards grid at `repeat(auto-fill, minmax(340px, 1fr))` with a 24px gap. Dense working views use two-column splits — diary tree at 260px plus an editor column, settings nav at 200px plus content, data-analysis chart list plus chart canvas. There are no hard pixel breakpoints; density responds to available width.

## Elevation & Depth

**Flat at rest, lifted on interaction.** Cards ship with a subtle shadow (lv1) and hairline border; on hover the shadow deepens (lv2). Overlays (menus, popovers) use lv3; modals and drawers lv4.

- **lv1** `0 1px 2px rgba(0,0,0,.05)` — default cards, static containers
- **lv2** `0 4px 12px rgba(0,0,0,.08)` — hover, dropdowns, composer
- **lv3** `0 8px 24px rgba(0,0,0,.10)` — popovers, messages, notifications
- **lv4** `0 16px 40px rgba(0,0,0,.14)` — modals, drawers
- **Focus** `0 0 0 2px rgba(57,100,254,.25)` — input focus ring, focus-visible
- Dark theme shadows deepen to `rgba(0,0,0,.30/.35/.45/.55)` for separation on near-black surfaces.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state: hover, focus, modal overlay.

## Shapes

Softly rounded, hairline-separated. Corners step up by function: 6px tags/chips (`sm`), 8px buttons/inputs/selects/nav (`md`), 12px cards/menus/popovers (`lg`), 16px modals/drawers (`xl`), 20px chat bubbles and composer (`chat`), fully round for icon buttons, switches and pills (`full`). **Window-control buttons are 28px circles** with neutral hover fills.

Borders are 1px hairlines from the l1/l2/l3 layers. The scrollbar is a 5px track with an 8px-radius cool-neutral thumb (18% opacity, 40% on hover) — the only scrollbar shape in the app.

### Named Rules
**The Cool-Neutral Scrollbar Rule.** Every scrollable region uses `@include custom-scrollbar`. Never a browser-default scrollbar, never a manually restyled one.

## Components

### Buttons
- 8px corners, consistent height (28/36/44px), 72px minimum width (small exempt).
- **Primary:** DeepSeek blue fill, white text. Hover `#5b7fff` (light) / `#6b8aff` (dark), active `#2b52e6`.
- **Default/Secondary:** transparent fill, hairline stroke. Hover gets a neutral hover-fill background (no border-color swap).
- **Text:** no border, secondary text; hover neutral fill + major text. Text danger: vermillion, danger-tint hover.
- **Primary Danger:** vermillion fill, white text, hover 85% opacity.
- **Link:** blue text, lightens on hover.
- **Focus:** 2px blue outline on `:focus-visible`. Transitions 150ms.

### Cards
- 12px corners, hairline border, white/dark-surface fill, 24px padding, lv1 shadow.
- Hover: shadow deepens to lv2 (border stays neutral).
- Ledger cards lift `translateY(-2px)` on hover; the first ledger card is larger.

### Inputs / Fields
- 8px corners, hairline border at rest; unified 36px height.
- Focus: border shifts to blue + blue focus ring (`shadow-focus`).

### Tables
- Header: 12px Inter/500, secondary text, `minor-background` fill, hairline bottom border.
- Body: 14px Inter/400, major text, soft-divider row lines; hover row neutral hover-fill; selected row blue active-fill.
- Pagination: active/hover page numbers use blue.

### Tags / Chips
- 6px corners, 2px/8px padding, no border, 12px medium Inter.
- Income/expense/transfer/outlier tags take their semantic color on a 10%/14% tint.

### Amounts / Statistics
- JetBrains Mono with tabular-nums; semantic colors for income/expense/transfer values only.
- Statistic footer: 12px labels with mono values; values keep semantic colors.

### Navigation
- **Sidebar:** 200px, `sidebar-fill` background, hairline right border. Nav items 8px-radius; hover neutral fill; active blue-tinted fill + blue text + 500 weight (no side stripes).
- **Top bar:** frameless drag region; window controls are 28px pill buttons; kernel status dot green/red by state.
- **Tabs:** 2px blue ink bar, blue active text at 600.

### Modals / Drawers
- 16px corners, lv4 shadow, hairline header/footer dividers. Header 18px/600. Body 24px padding. Footer right-aligned actions.

### AI Chat (signature, DSH language)
- **User message:** `bubble` fill (light `#eef0f4` / dark `#24282f`), major text, 20px radius, right-aligned, max 85%.
- **Assistant message:** transparent, no bubble — markdown carries the visual weight; inline code and code blocks use the `markdown-code-block` fill; tables, blockquotes, links follow the neutral grammar.
- **Thinking rows:** collapsible row with a dot indicator; active thinking shows an amber-tinted block with a spinning ring; streaming cursor blinks.
- **Tool cards:** amber tint + amber border while running; flips to income tint + success border when done.
- **Streaming status:** 28px bar with mono blue text + blue spinner ("AI 正在回复...").
- **Composer:** 20px-radius card — hairline border, lv2 shadow, focus ring on `:focus-within`, 32px circular send/stop button (blue / vermillion).

## Do's and Don'ts

### Do:
- **Do** use JetBrains Mono with `font-variant-numeric: tabular-nums` for every monetary value.
- **Do** keep the DeepSeek blue accent to ≤10% of any screen — interactive elements and focus states only.
- **Do** use `bg-base` (`#f9fafb` / `#0f1115`) as the page backdrop and let the appearance store drive `data-theme`.
- **Do** use semantic colors (income/expense/transfer/outlier) only where transaction data lives, in both themes.
- **Do** use the ledger palette only for ledger identity and its category tags.
- **Do** use bordered cards with shadow only on hover — flat by default.
- **Do** keep transitions fast (150–200ms) — the user is in flow.
- **Do** use `:focus-visible` for keyboard navigation focus rings.
- **Do** respect the Electron frameless window: drag regions for the title bar, `no-drag` for interactive elements inside it.
- **Do** honor `prefers-reduced-motion` by disabling decorative animation (streaming shimmer, spins, fades).

### Don't:
- **Don't** use warm ivory/cream/sand/beige as the dominant background — the neutrals are cool, toward the blue, not toward generic warmth.
- **Don't** add decorative motion that doesn't convey state — no orchestrated page-load sequences, no bouncy easing, no elastic.
- **Don't** use `border-left` or `border-right` greater than 1px as colored accent stripes on cards or list items.
- **Don't** use gradient text (`background-clip: text`) anywhere, including streaming status — solid blue is enough.
- **Don't** ship a standard browser scrollbar — always `@include custom-scrollbar`.
- **Don't** use display fonts in UI labels, buttons, or data tables.
- **Don't** leak semantic transaction colors into navigation, chrome, or general-purpose UI.
- **Don't** make the save button look different in two places — consistent affordance vocabulary across the entire surface.
- **Don't** leave light-mode-only hardcoded colors (hex/rgba) in styles — every surface needs a dark variant through tokens.
