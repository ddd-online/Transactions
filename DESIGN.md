---
name: Transactions
description: A calm, restrained personal finance desktop app — data lives locally, the interface stays quiet
colors:
  muted-teal:
    value: "#4A8E70"
    role: primary
  muted-teal-light:
    value: "#6AB08C"
    role: primary-light
  warm-bark:
    value: "#8C7B6E"
    role: secondary
  amber-gold:
    value: "#C6963A"
    role: accent
  warm-ivory:
    value: "#F7F4EF"
    role: neutral-bg-warm
  clean-white:
    value: "#FFFFFF"
    role: neutral-bg
  stone-gray:
    value: "#F0EDE6"
    role: neutral-bg-dim
  warm-border:
    value: "#E2DDD5"
    role: neutral-border
  soft-divider:
    value: "#EBE6DE"
    role: neutral-divider
  ink-black:
    value: "#1D1D1B"
    role: neutral-text
  slate-text:
    value: "#5C5C55"
    role: neutral-text-secondary
  muted-text:
    value: "#9E9E96"
    role: neutral-text-disabled
  sage-income:
    value: "#3D8C5E"
    role: semantic-income
  vermillion-expense:
    value: "#D9705A"
    role: semantic-expense
  steel-transfer:
    value: "#5C8DB5"
    role: semantic-transfer
typography:
  display:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.015em"
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
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  xxl: "32px"
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
  card:
    backgroundColor: "{colors.clean-white}"
    border: "1px solid {colors.warm-border}"
    rounded: "{rounded.lg}"
    padding: "24px"
  table-header:
    textColor: "{colors.slate-text}"
    typography: label
    backgroundColor: "{colors.stone-gray}"
---

# Design System: Transactions

## 1. Overview

**Creative North Star: "The Quiet Ledger"**

Transactions is a calm, restrained personal finance desktop app. The interface exists to serve the task — tracking money — and then gets out of the way. It rejects the SaaS dashboard reflex (over-decorated, colorful, busy), the cold corporate greybox, and the gamified whimsical. Instead, it aims for the feel of a well-kept private ledger on a clean desk: warm without being soft, precise without being sterile.

The design strategy is **Restrained with deliberate semantic payload**: a single muted-teal accent (`#4A8E70`) carries primary actions and focus states, used on ≤10% of surface area. Semantic colors (income green, expense vermillion, transfer blue) activate only where transaction data lives. The background hierarchy is warm ivory and white — never cream paste, never glass — with hairline borders for separation and soft shadows only on hover.

**Key Characteristics:**
- Restrained color: one accent, semantic colors only for data
- Inter for UI, JetBrains Mono for numbers — tabular-nums on every amount
- Monospace money display at 14–28px with negative letter-spacing for numeric density
- Cards are bordered, not shadow-dominant; elevation lifts on hover
- Custom 5px warm-stone scrollbar with hover fade-in
- Electron-native: frameless window with custom title bar, drag regions, no OS chrome
- Flat at rest, subtle shadow on interaction — motion conveys state, not decoration
- Only supported state: light mode; no dark variant

## 2. Colors: The Kinpaku Palette

The palette draws from natural mineral tones — muted teal, warm bark, amber gold, warm ivory. No neon, no synthetic saturation, no gradient overlays.

### Primary
- **Muted Teal** (`#4A8E70`): Primary action buttons, focused borders, selected states, tab ink bars, active icon color, toggle/radio/checkbox checked state. This is the only color that claims the interactive surface.
- **Muted Teal Light** (`#6AB08C`): Hover variant for primary buttons and links.

### Semantic
- **Sage Green** (`#3D8C5E`): Income transactions. Also maps to success/positive states.
- **Vermillion** (`#D9705A`): Expense transactions. Also maps to error/negative/danger states.
- **Steel Blue** (`#5C8DB5`): Transfer transactions.
- **Amber Gold** (`#C6963A`): Outlier markers, warning indicators, accent/secondary highlight.

### Neutral
- **Clean White** (`#FFFFFF`): Major content background, elevated surfaces, cards.
- **Warm Ivory** (`#F7F4EF`): Page background, body backdrop. The page's ambient tone.
- **Stone Gray** (`#F0EDE6`): Minor background — sidebar, table headers, secondary panels.
- **Warm Border** (`#E2DDD5`): Window borders, card borders, input strokes at rest.
- **Soft Divider** (`#EBE6DE`): Internal dividers, subtle separators.
- **Ink Black** (`#1D1D1B`): Primary text, headings, major UI labels.
- **Slate** (`#5C5C55`): Secondary text, captions, table header text.
- **Muted** (`#9E9E96`): Disabled text.

### Named Rules
**The One Accent Rule.** The primary teal accent is used on ≤10% of any given screen. Its rarity is the point. Saturation on interactive elements only; never as decoration, never as a background wash, never on non-interactive surfaces.

**The Semantic Silo Rule.** Income/expense/transfer colors only appear where transaction data lives — tables, tags, amount displays, chart segments. They do not leak into navigation, chrome, or general-purpose UI.

## 3. Typography

**Display/Body Font:** Inter (system-ui fallback)
**Monospace Font:** JetBrains Mono (SF Mono, Consolas fallback)

**Character:** Inter's clean, neutral geometry serves the UI — labels, headings, body text. JetBrains Mono's narrow, precise letterforms give numbers authority; every amount uses tabular-nums and negative letter-spacing so columns align and digits feel dense. No serif, no display pairing — one sans family across the entire interface.

### Hierarchy
- **Title** (600 weight, 20px, 1.4 line-height): Page and section headings. Used in `.typography-title`, `.section-header-title`.
- **Title Small** (600 weight, 18px, 1.4 line-height): Modal titles, card titles, chart headers. Used in `.card-title`.
- **Section** (500 weight, 16px, 1.6 line-height): Form labels, filter headings, subsection labels.
- **Body** (400 weight, 14px, 1.6 line-height): Default prose, table cells, descriptions.
- **Caption** (400 weight, 12px, 1.6 line-height): Secondary labels, table headers (when not uppercase).
- **Small** (500 weight, 11px, 1.2 line-height, uppercase, 0.04em tracking): Badges, micro-labels, statistic labels.
- **Amount** (500 weight, 20px, tabular-nums, -0.02em tracking): Standard monetary values in tables and cards.
- **Amount Large** (600 weight, 28px, tabular-nums, -0.03em tracking): Hero metrics, dashboard totals.

### Named Rules
**The Monospace Money Rule.** Every monetary value — in tables, cards, dashboards, forms — uses JetBrains Mono with `font-variant-numeric: tabular-nums`. Never display a financial number in a proportional font.

## 4. Elevation

The system is **flat at rest, lifted on interaction**. Cards ship with a subtle ambient shadow (`0 1px 3px rgba(0,0,0,0.05)`) and a warm border. On hover, the shadow deepens to `0 2px 8px rgba(0,0,0,0.07)` and the border shifts to the primary teal accent. This is structural elevation: shadow communicates interactive affordance, not spatial depth for its own sake. No shadow on static content surfaces, no layered depth illusions, no z-index architecture beyond the modal stack.

### Shadow Vocabulary
- **Ambient (sm)** (`0 1px 3px rgba(0,0,0,0.05)`): Default card, static containers.
- **Hover (md)** (`0 2px 8px rgba(0,0,0,0.07)`): Card hover, dropdown popover.
- **Modal (lg)** (`0 4px 16px rgba(0,0,0,0.09)`): Modal backdrop, drawer.
- **Focus (0 0 0 2px rgba(74,142,112,0.15)`): Input focus ring, button focus-visible.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest. Shadows appear only as a response to state: hover, focus, modal overlay. A static card with a heavy shadow is an anti-pattern.

## 5. Components

### Buttons
- **Shape:** Rounded 8px corners, consistent height (36px default, 28px small, 44px large).
- **Primary:** Muted Teal fill (`#4A8E70`), white text, no border. Hover lightens to `#6AB08C`.
- **Default/Secondary:** Transparent fill, warm-border stroke, ink text. Hover shifts border to teal, text to teal.
- **Text:** No border, slate text. Hover gets a teal-tinted background (8% opacity) and teal text.
- **Text Danger:** Vermillion text. Hover gets vermillion-tinted background (10% opacity).
- **Primary Danger:** Vermillion fill, white text.
- **Danger on close:** Close button hover shifts background to vermillion at 10% opacity.
- **Icon-only:** Square (width = height), centered content, same size classes.
- **Focus:** 2px teal outline at 2px offset on `:focus-visible`.
- **Transition:** All button state changes at 150ms ease.

### Cards
- **Shape:** 12px rounded corners, 1px warm border, white fill, 24px internal padding.
- **Hover:** Shadow deepens, border shifts to teal. For ledger cards: `translateY(-2px)` lift.
- **Grid:** `repeat(auto-fill, minmax(340px, 1fr))`, 24px gap.

### Inputs / Fields
- **Shape:** 8px rounded corners, warm border at rest.
- **Height:** Unified to 36px to match button height.
- **Focus:** Border shifts to teal, teal-tinted glow (`0 0 0 2px rgba(74,142,112,0.15)`).
- **Select:** Same height, border, and focus treatment. Single-select text vertically centered.

### Tables
- **Header:** 12px uppercase Inter at 600 weight, slate text, stone-gray background, 12px padding.
- **Body:** 14px Inter at 400 weight, ink text.
- **Hover row:** Teal-tinted background at 8% opacity.
- **Selected row:** Teal-tinted background at 14% opacity.

### Tags / Chips
- **Shape:** 6px rounded, 2px/8px padding, no border.
- **Income:** Sage green at 10% opacity background, sage text.
- **Expense:** Vermillion at 10% opacity background, vermillion text.
- **Transfer:** Steel blue at 10% opacity background, steel text.

### Navigation
- **Sider:** 56px wide, stone-gray background, icon-centered layout. Icons are 40×40px with 8px radius.
- **Nav buttons:** Slate icon at rest, teal tint on hover, teal fill (`active-bg`) when active. Has focus-visible outline.
- **Top bar:** Frameless Electron drag region. Center section carries page title; right section carries window controls and actions.
- **Tabs:** Teal ink bar (2px), teal active tab text at 600 weight, 24px bottom margin.

### Modals
- **Shape:** 16px rounded, shadow-xl, warm-divider borders on header and footer.
- **Header:** 18px Inter at 500 weight, 16px/24px padding.
- **Body:** 24px padding.
- **Footer:** 16px/24px padding, right-aligned actions.

### Scrollbar
- **Custom:** 5px wide, transparent track, warm-stone thumb at 18% opacity. Thumb deepens to 40% on hover. Transition at 300ms ease. Applied to all scrollable regions via `@include custom-scrollbar`.

## 6. Do's and Don'ts

### Do:
- **Do** use JetBrains Mono with `font-variant-numeric: tabular-nums` for every monetary value.
- **Do** keep the primary teal accent to ≤10% of any screen — interactive elements and focus states only.
- **Do** use the warm-ivory page background (`#F7F4EF`) as the default body backdrop.
- **Do** use semantic colors (sage/vermillion/steel) only where transaction data lives.
- **Do** use bordered cards with shadow only on hover — flat by default.
- **Do** keep transitions fast (150–200ms) — the user is in flow.
- **Do** use `:focus-visible` for keyboard navigation focus rings.
- **Do** respect the Electron frameless window: drag regions for the title bar, `no-drag` for interactive elements inside it.

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
