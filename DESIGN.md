---
name: Transactions
description: A calm, restrained personal finance desktop app — data lives locally, the interface stays quiet
colors:
  muted-teal: "#4A8E70"
  muted-teal-light: "#6AB08C"
  warm-bark: "#8C7B6E"
  amber-gold: "#C6963A"
  amber-gold-light: "#D4AE5E"
  amber-gold-deep: "#B8872E"
  warm-ivory: "#F7F4EF"
  clean-white: "#FFFFFF"
  stone-gray: "#F0EDE6"
  warm-border: "#E2DDD5"
  soft-divider: "#EBE6DE"
  ink-black: "#1D1D1B"
  slate-text: "#5C5C55"
  muted-text: "#9E9E96"
  sage-income: "#3D8C5E"
  vermillion-expense: "#D9705A"
  steel-transfer: "#5C8DB5"
  amber-outlier: "#C68E30"
  teal-hover-bg: "rgba(74, 142, 112, 0.08)"
  teal-active-bg: "rgba(74, 142, 112, 0.14)"
  vermillion-danger-bg: "rgba(217, 112, 90, 0.10)"
  ledger-forest: "#4A8E70"
  ledger-warm-brown: "#8C7B6E"
  ledger-amber: "#C6963A"
  ledger-vermillion: "#D9705A"
  ledger-slate-blue: "#5C8DB5"
  ledger-ochre: "#9E8C7E"
  ledger-moss: "#6B9E7E"
  ledger-camel: "#B89A80"
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
components:
  button-primary:
    backgroundColor: "{colors.muted-teal}"
    textColor: "{colors.clean-white}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.muted-teal-light}"
  button-default:
    backgroundColor: transparent
    textColor: "{colors.ink-black}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-default-hover:
    textColor: "{colors.muted-teal}"
  button-text:
    backgroundColor: transparent
    textColor: "{colors.slate-text}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  button-primary-danger:
    backgroundColor: "{colors.vermillion-expense}"
    textColor: "{colors.clean-white}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.clean-white}"
    textColor: "{colors.ink-black}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  card:
    backgroundColor: "{colors.clean-white}"
    rounded: "{rounded.lg}"
    padding: "24px"
  ledger-card:
    backgroundColor: "{colors.clean-white}"
    rounded: "{rounded.lg}"
    padding: "24px"
  table-header:
    textColor: "{colors.slate-text}"
    typography: "{typography.label}"
    backgroundColor: "{colors.stone-gray}"
  nav-button:
    backgroundColor: transparent
    textColor: "{colors.slate-text}"
    rounded: "{rounded.md}"
    size: "40px"
  amount:
    typography: "{typography.mono}"
  tag-income:
    backgroundColor: "rgba(61, 140, 94, 0.10)"
    textColor: "{colors.sage-income}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  tag-expense:
    backgroundColor: "rgba(217, 112, 90, 0.10)"
    textColor: "{colors.vermillion-expense}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  tag-transfer:
    backgroundColor: "rgba(92, 141, 181, 0.10)"
    textColor: "{colors.steel-transfer}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  tag-outlier:
    backgroundColor: "rgba(198, 142, 48, 0.10)"
    textColor: "{colors.amber-outlier}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
---

# Design System: Transactions

## Overview

**Creative North Star: "The Quiet Ledger"**

Transactions is a calm, restrained personal finance desktop app. The interface exists to serve the task — tracking money — and then gets out of the way. It rejects the SaaS dashboard reflex (over-decorated, colorful, busy), the cold corporate greybox, and the gamified whimsical. Instead, it aims for the feel of a well-kept private ledger on a clean desk: warm without being soft, precise without being sterile.

The design strategy is **Restrained with deliberate semantic payload**: a single muted-teal accent (`#4A8E70`) carries primary actions and focus states, used on ≤10% of surface area. Semantic colors (income green, expense vermillion, transfer blue, outlier amber) activate only where transaction data lives. The background hierarchy is warm ivory and white — never cream paste, never glass — with hairline borders for separation and soft shadows only on hover. Newer surfaces — AI chat, diary, key-event galleries — live inside the same grammar: the same cards, tints, and mono numerals, no second visual language.

**Key Characteristics:**
- Restrained color: one accent, semantic colors only for data
- Inter for UI, JetBrains Mono for numbers — tabular-nums on every amount
- Monospace money display at 14–28px with negative letter-spacing for numeric density
- Cards are bordered, not shadow-dominant; elevation lifts on hover
- Custom 5px warm-stone scrollbar with hover fade-in
- Electron-native: frameless window with custom title bar, drag regions, no OS chrome
- Flat at rest, subtle shadow on interaction — motion conveys state, not decoration
- Only supported state: light mode; no dark variant
- `prefers-reduced-motion` is respected wherever motion exists

## Colors

The palette draws from natural mineral tones — muted teal, warm bark, amber gold, warm ivory. No neon, no synthetic saturation, no gradient overlays.

### Primary
- **Muted Teal** (`#4A8E70`): Primary action buttons, focused borders, selected states, tab ink bars, active icon color, toggle/radio/checkbox checked state. This is the only color that claims the interactive surface.
- **Muted Teal Light** (`#6AB08C`): Hover variant for primary buttons and links.

### Accent
- **Amber Gold** (`#C6963A`): Accent/secondary highlight, warm atmospheric tinting.
- **Amber Gold Light** (`#D4AE5E`): Hover-light variant of the amber accent.
- **Amber Gold Deep** (`#B8872E`): Pressed/deep variant of the amber accent.

### Semantic
- **Sage Green** (`#3D8C5E`): Income transactions. Also maps to success/positive states.
- **Vermillion** (`#D9705A`): Expense transactions. Also maps to error/negative/danger states.
- **Steel Blue** (`#5C8DB5`): Transfer transactions.
- **Outlier Amber** (`#C68E30`): Outlier markers and warning indicators — a slightly deeper, more alert amber than the accent.

### Interactive Tints
- **Teal Hover Tint** (`rgba(74, 142, 112, 0.08)`): Hover backgrounds on text buttons, nav buttons, table rows, in-range date cells.
- **Teal Active Tint** (`rgba(74, 142, 112, 0.14)`): Selected rows, active nav buttons.
- **Vermillion Danger Tint** (`rgba(217, 112, 90, 0.10)`): Danger hover backgrounds on close buttons and text-danger buttons.

### Neutral
- **Clean White** (`#FFFFFF`): Major content background, elevated surfaces, cards.
- **Warm Ivory** (`#F7F4EF`): Page background, body backdrop. The page's ambient tone.
- **Stone Gray** (`#F0EDE6`): Minor background — sidebar, table headers, secondary panels.
- **Warm Border** (`#E2DDD5`): Window borders, card borders, input strokes at rest.
- **Soft Divider** (`#EBE6DE`): Internal dividers, subtle separators.
- **Ink Black** (`#1D1D1B`): Primary text, headings, major UI labels.
- **Slate** (`#5C5C55`): Secondary text, captions, table header text, icon default.
- **Muted** (`#9E9E96`): Disabled text.

### Ledger Palette
Eight natural tones give each ledger its own identity: forest (`#4A8E70`), warm brown (`#8C7B6E`), amber (`#C6963A`), vermillion (`#D9705A`), slate blue (`#5C8DB5`), ochre (`#9E8C7E`), moss (`#6B9E7E`), camel (`#B89A80`). Ledger colors may also tint that ledger's category tags — but they are identity colors, never navigation or chrome colors.

### Named Rules
**The One Accent Rule.** The primary teal accent is used on ≤10% of any given screen. Its rarity is the point. Saturation on interactive elements only; never as decoration, never as a background wash, never on non-interactive surfaces.

**The Semantic Silo Rule.** Income/expense/transfer/outlier colors only appear where transaction data lives — tables, tags, amount displays, chart segments, ledger identity. They do not leak into navigation, chrome, or general-purpose UI.

## Typography

**Display/Body Font:** Inter (system-ui fallback)
**Monospace Font:** JetBrains Mono (SF Mono, Consolas fallback)

**Character:** Inter's clean, neutral geometry serves the UI — labels, headings, body text. JetBrains Mono's narrow, precise letterforms give numbers authority; every amount uses tabular-nums and negative letter-spacing so columns align and digits feel dense. No serif, no display pairing — one sans family across the entire interface.

### Hierarchy
- **Display XL** (700 weight, 36px, 1.2 line-height, -0.02em): Hero numbers and key metrics.
- **Display** (700 weight, 28px, 1.2 line-height, -0.015em): Major page headings, large totals.
- **Display Small** (600 weight, 24px, 1.2 line-height): Page titles, prominent section headings.
- **Title** (600 weight, 20px, 1.4 line-height): Page and section headings. Used in `.typography-title`, `.section-header-title`.
- **Title Small** (600 weight, 18px, 1.4 line-height): Modal titles, card titles, chart headers. Used in `.card-title`.
- **Section** (500 weight, 16px, 1.6 line-height): Form labels, filter headings, subsection labels.
- **Body** (400 weight, 14px, 1.6 line-height): Default prose, table cells, descriptions.
- **Body Small** (400 weight, 13px, 1.6 line-height): Compact secondary text in dense toolbars.
- **Caption** (400 weight, 12px, 1.6 line-height): Secondary labels, metadata, helper text.
- **Small** (500 weight, 11px, 1.2 line-height, uppercase, 0.04em tracking): Badges, micro-labels, statistic labels.
- **Label** (500 weight, 12px, uppercase, 0.04em tracking): Table headers and statistic labels; the `.typography-label` class carries 0.06em.
- **Amount** (500 weight, 20px, tabular-nums, -0.02em tracking): Standard monetary values in tables and cards.
- **Amount Large** (600 weight, 28px, tabular-nums, -0.03em tracking): Hero metrics, dashboard totals.
- **Amount Small** (500 weight, 14px, tabular-nums, -0.01em tracking): Dense table cells and statistics footers.

### Named Rules
**The Monospace Money Rule.** Every monetary value — in tables, cards, dashboards, forms — uses JetBrains Mono with `font-variant-numeric: tabular-nums`. Never display a financial number in a proportional font.

## Layout

The app is a fixed desktop shell with one scrolling content column. A 56px icon sider (`--billadm-size-sider-width`) sits at the left on stone gray; the 48px frameless top bar (`--billadm-size-header-height`) is a drag region with the page title centered and window controls at the right; a 44px statistics footer (`--billadm-size-footer-height`) anchors the transaction views. Content scrolls on clean white with the custom scrollbar; the page backdrop is warm ivory.

Spacing follows an 8px base scale: 2 / 4 / 8 / 12 / 16 / 24 / 32 / 48px (`2xs`–`3xl`). Content padding is 20px. Cards grid at `repeat(auto-fill, minmax(340px, 1fr))` with a 24px gap; toolbars use a left/center/right split that wraps on narrow windows. Dense working views (diary, AI chat) use two-column splits — e.g. diary tree at 260px plus an editor column. The key-event calendar shows 12 months in 4 columns and collapses to 2, then 1, as the window narrows. There are no hard pixel breakpoints; density and column count respond to available width.

## Elevation & Depth

The system is **flat at rest, lifted on interaction**. Cards ship with a subtle ambient shadow and a warm border; on hover the shadow deepens and the border shifts to teal. This is structural elevation: shadow communicates interactive affordance, not spatial depth for its own sake. No shadow on static content surfaces, no layered depth illusions, no z-index architecture beyond the modal stack.

Depth is also carried by **tonal layering**: warm ivory page → white content surfaces → stone-gray chrome (sider, table headers). A fixed, pointer-events-none radial atmosphere — teal at 3% near the top-left, amber at 2% near the bottom-right — breathes warmth behind the ivory without ever reading as a gradient overlay.

### Shadow Vocabulary
- **Ambient (sm)** (`0 1px 3px rgba(0,0,0,0.05)`): Default card, static containers.
- **Hover (md)** (`0 2px 8px rgba(0,0,0,0.07)`): Card hover, dropdown popover.
- **Overlay (lg)** (`0 4px 16px rgba(0,0,0,0.09)`): Popovers, messages, notifications.
- **Modal (xl)** (`0 8px 32px rgba(0,0,0,0.12)`): Modal dialogs, drawers.
- **Focus** (`0 0 0 2px rgba(74,142,112,0.15)`): Input focus ring, button focus-visible.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state: hover, focus, modal overlay. A static card with a heavy shadow is an anti-pattern.

## Shapes

The form language is **softly rounded, hairline-separated**. Corners step up by function: 6px for tags and chips (`sm`), 8px for buttons, inputs, selects, pickers, nav and icon buttons (`md`), 12px for cards, popovers, float buttons (`lg`), 16px for modals and drawers (`xl`), and fully round for switches and pills (`full`).

Borders are always 1px hairlines — warm border (`#E2DDD5`) for surfaces and input strokes, soft divider (`#EBE6DE`) for internal separators. No heavy strokes, no clipping, no experimental geometry. The scrollbar is a 5px track with an 8px-radius warm-stone thumb (`rgba(141, 127, 111, 0.18)` at rest, 0.40 on hover) with transparent margins; it is the only scrollbar shape in the app.

### Named Rules
**The Warm-Stone Scrollbar Rule.** Every scrollable region uses `@include custom-scrollbar` — 5px wide, transparent track, warm-stone thumb that deepens on hover. Never a browser-default scrollbar, never a manually restyled one.

## Components

### Buttons
- **Shape:** Rounded 8px corners, consistent height (36px default, 28px small, 44px large), 72px minimum width (small buttons exempt).
- **Primary:** Muted Teal fill (`#4A8E70`), white text, no border. Hover lightens to `#6AB08C`.
- **Default/Secondary:** Transparent fill, warm-border stroke, ink text. Hover shifts border and text to teal.
- **Dashed:** Mapped to the secondary style — warm-border stroke, slate text, teal on hover.
- **Text:** No border, slate text. Hover gets a teal-tinted background (8% opacity) and teal text.
- **Text Danger:** Vermillion text. Hover gets vermillion-tinted background (10% opacity).
- **Primary Danger:** Vermillion fill (`#D9705A`), white text. Hover drops to 85% opacity.
- **Link:** Treated as a text variant — teal text, lightens on hover.
- **Danger on close:** Close button hover shifts background to vermillion at 10% opacity.
- **Icon-only:** Square (width = height), centered content, same size classes.
- **Focus:** 2px teal outline at 2px offset on `:focus-visible`.
- **Transition:** All button state changes at 150ms ease.

### Cards
- **Shape:** 12px rounded corners, 1px warm border, white fill, 24px internal padding.
- **Hover:** Shadow deepens, border shifts to teal. For ledger cards: `translateY(-2px)` lift.
- **Grid:** `repeat(auto-fill, minmax(340px, 1fr))`, 24px gap.
- **Ledger cards** carry the ledger's identity color as a card accent and lift on hover; the first ledger card is larger than the rest.

### Inputs / Fields
- **Shape:** 8px rounded corners, warm border at rest.
- **Height:** Unified to 36px to match button height (selects, pickers, inputs all share it).
- **Focus:** Border shifts to teal, teal-tinted glow (`0 0 0 2px rgba(74,142,112,0.15)`).
- **Select:** Same height, border, and focus treatment. Single-select text vertically centered.

### Tables
- **Header:** 12px uppercase Inter at 600 weight, 0.04em tracking, slate text, stone-gray background, 12px/16px padding.
- **Body:** 14px Inter at 400 weight, ink text, soft-divider row lines.
- **Hover row:** Teal-tinted background at 8% opacity.
- **Selected row:** Teal-tinted background at 14% opacity.
- **Pagination:** Active and hovered page numbers use the teal accent.

### Tags / Chips
- **Shape:** 6px rounded, 2px/8px padding, no border, 12px medium Inter.
- **Income:** Sage green at 10% opacity background, sage text.
- **Expense:** Vermillion at 10% opacity background, vermillion text.
- **Transfer:** Steel blue at 10% opacity background, steel text.
- **Outlier:** Outlier amber at 10% opacity background, amber text.

### Amounts / Statistics
- **Amount:** JetBrains Mono, 20px, 500 weight, tabular-nums, -0.02em.
- **Amount Large:** 28px, 600 weight, -0.03em — hero totals.
- **Amount Small:** 14px, 500 weight, -0.01em — statistics footers.
- **Statistic footer:** Uppercase 12px labels with mono values; income/expense/transfer values take their semantic colors.

### Navigation
- **Sider:** 56px wide, stone-gray background, icon-centered layout. Icons are 40×40px with 8px radius.
- **Nav buttons:** Slate icon at rest, teal tint on hover, teal fill (`active-bg`) when active. Has focus-visible outline.
- **Top bar:** Frameless Electron drag region. Center section carries page title; right section carries window controls and actions; interactive children are `no-drag`.
- **Tabs:** Teal ink bar (2px), teal active tab text at 600 weight, 24px bottom margin.

### Modals / Drawers
- **Shape:** 16px rounded, shadow-xl, warm-divider borders on header and footer.
- **Header:** 18px Inter at 500 weight, 16px/24px padding.
- **Body:** 24px padding.
- **Footer:** 16px/24px padding, right-aligned actions.

### AI Chat (signature)
- **User message:** Muted-teal fill, white text, 8px radius, aligned right.
- **Assistant message:** Warm-bark tint at 5% opacity, hairline warm-border stroke, aligned left; Markdown content with mono inline code.
- **Tool cards:** Amber tint at 4% opacity with an amber 18% border; flips to a sage tint with a success border once the tool completes.
- **Streaming:** Amber ring spinner plus a blinking cursor; a "thinking" toggle exposes the model's reasoning inline.

### Scrollbar
- **Custom:** 5px wide, transparent track, warm-stone thumb at 18% opacity. Thumb deepens to 40% on hover. Transition at 300ms ease. Applied to all scrollable regions via `@include custom-scrollbar`.

## Do's and Don'ts

### Do:
- **Do** use JetBrains Mono with `font-variant-numeric: tabular-nums` for every monetary value.
- **Do** keep the primary teal accent to ≤10% of any screen — interactive elements and focus states only.
- **Do** use the warm-ivory page background (`#F7F4EF`) as the default body backdrop.
- **Do** use semantic colors (sage/vermillion/steel/amber) only where transaction data lives.
- **Do** use the ledger palette only for ledger identity and its category tags.
- **Do** use bordered cards with shadow only on hover — flat by default.
- **Do** keep transitions fast (150–200ms) — the user is in flow.
- **Do** use `:focus-visible` for keyboard navigation focus rings.
- **Do** respect the Electron frameless window: drag regions for the title bar, `no-drag` for interactive elements inside it.
- **Do** honor `prefers-reduced-motion` by disabling decorative animation.

### Don't:
- **Don't** use SaaS cream/sand/beige warm-neutral as the dominant background — the warm ivory is tinted toward the brand's teal, not toward generic warmth.
- **Don't** use dark mode, neon accents, or glassmorphism.
- **Don't** add decorative motion that doesn't convey state — no orchestrated page-load sequences, no bouncy easing, no elastic.
- **Don't** use `border-left` or `border-right` greater than 1px as colored accent stripes on cards or list items.
- **Don't** use gradient text (`background-clip: text`) anywhere.
- **Don't** ship a standard browser scrollbar — always `@include custom-scrollbar`.
- **Don't** use display fonts in UI labels, buttons, or data tables.
- **Don't** gaudy overloaded SaaS dashboard patterns with excessive decoration, colorful cards, or floating animations.
- **Don't** cold corporate financial software aesthetic with dense grey tables and zero warmth.
- **Don't** cute gamified bookkeeping with cartoon illustrations, bouncing animations, or badge systems.
- **Don't** make the save button look different in two places — consistent affordance vocabulary across the entire surface.
