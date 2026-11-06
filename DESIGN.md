---
name: Transactions
description: A clean, airy, trustworthy desktop personal finance workspace
colors:
  primary: "#3964fe"
  primary-hover: "#2b52e6"
  primary-active: "#1e40c8"
  primary-tint: "rgba(57, 100, 254, 0.08)"
  canvas: "#f9fafb"
  surface: "#ffffff"
  surface-soft: "#f3f4f6"
  text-major: "#0f1115"
  text-secondary: "#61666b"
  text-tertiary: "#6b7078"
  text-disabled: "#9aa0a8"
  text-inverse: "#ffffff"
  border: "#e8eaed"
  border-l2: "#e2e4e8"
  border-l3: "#d5d8dd"
  divider: "#eceef1"
  hover-bg: "rgba(15, 17, 21, 0.06)"
  active-bg: "rgba(57, 100, 254, 0.10)"
  income: "#16a34a"
  expense: "#dc2626"
  transfer: "#3b82f6"
  outlier: "#d97706"
  income-tint: "rgba(22, 163, 74, 0.10)"
  expense-tint: "rgba(220, 38, 38, 0.10)"
  transfer-tint: "rgba(59, 130, 246, 0.10)"
  outlier-tint: "rgba(217, 119, 6, 0.10)"
  ledger-forest: "#4a8e70"
  ledger-amber: "#c6963a"
  ledger-slate-blue: "#5c8db5"
  ledger-vermillion: "#d9705a"
  ledger-warm-brown: "#8c7b6e"
  ledger-ochre: "#9e8c7e"
  ledger-moss: "#6b9e7e"
  ledger-camel: "#b89a80"
  series-1: "#d27369"
  series-2: "#469b5d"
  series-3: "#6095d7"
  series-4: "#b85e1a"
  series-5: "#d2a40f"
  series-6: "#27b5a8"
  series-7: "#d490cd"
  series-8: "#0389a0"
  series-9: "#806bb7"
  series-other: "#8b919a"
typography:
  display:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.015em"
  title:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: "0.04em"
  amount:
    fontFamily: "'JetBrains Mono', 'SF Mono', Consolas, 'Courier New', monospace"
    fontSize: "14px"
    fontWeight: 500
    lineHeight: 1.6
    letterSpacing: "-0.01em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
  full: "9999px"
spacing:
  2xs: "2px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  3xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.text-inverse}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 16px"
  button-primary-hover:
    backgroundColor: "{colors.primary-hover}"
    textColor: "{colors.text-inverse}"
  button-primary-active:
    backgroundColor: "{colors.primary-active}"
    textColor: "{colors.text-inverse}"
  button-primary-danger:
    backgroundColor: "{colors.expense}"
    textColor: "{colors.text-inverse}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-major}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 16px"
  button-text:
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 12px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-major}"
    rounded: "{rounded.md}"
    height: "36px"
    padding: "0 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "24px"
  tag:
    backgroundColor: "{colors.income-tint}"
    textColor: "{colors.income}"
    rounded: "{rounded.sm}"
    padding: "2px 8px"
  nav-item:
    textColor: "{colors.text-secondary}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  nav-item-active:
    backgroundColor: "{colors.active-bg}"
    textColor: "{colors.primary}"
---

# Design System: Transactions

## Overview

**Creative North Star: "The Focus Desk"**

Transactions is a desktop workstation for personal finance. The interface stays clean and airy — cool neutral surfaces, generous white space, and a single blue accent — so the numbers are the loudest thing on screen. Trustworthiness comes from precision: every amount is set in monospace with tabular figures, every layer is separated by a hairline or a tone rather than a heavy shadow, and every interactive element announces itself with a clear focus ring.

The system is refined and restrained by design: components are small, consistent, and quiet, built for dense data work rather than spectacle. Nothing competes with the ledger. Depth is expressed through light layering — surface tone plus 1px borders — with shadows reserved for genuine lift: hovers, popovers, and modals.

**Key Characteristics:**

- One accent voice (Clarity Blue) across actions, focus, and selection.
- Cool neutral hierarchy (Canvas / Paper / Soft Gray) with hairline dividers.
- Inter for UI, JetBrains Mono with tabular-nums for every monetary value.
- 8px-based spacing rhythm; compact 36px controls at the heart of the system.
- Light layering: tone and hairlines first, shadows only where surfaces truly lift.
- Dual theme (light + dark) over the same token names; dark values are tuned for contrast, never re-themed.

## Colors

Cool neutrals carry the interface; Clarity Blue is the single accent; a small semantic set (income/expense/transfer/outlier) exists strictly for transaction and stock data.

### Primary

- **Clarity Blue** (#3964fe): primary buttons, active navigation, links, tab ink, focus rings, selected states. **Hover 加深到 #2b52e6（白字 6.1:1）、按下再深到 #1e40c8（8.0:1）**，tint rgba(57,100,254,0.08) 用于选中底与行高亮。

  **悬停默认往深走，不往亮走。** 实色按钮上压的是白字，而 AntD 默认把悬停往亮里推（#3964fe → #6188ff）：白 + 亮蓝只有 **3.24:1**，指针停在按钮上的那一刻恰好掉出 AA。危险按钮同理（#dc2626 → #e8524d，白字 **3.66:1**）。所以 `colorPrimaryHover/Active` 与 `colorErrorHover/Active` 都按令牌显式给出，不交给算法推。

  **但深色下这一条要反着来。** 深色页面已经近黑，实色按钮面本来就只有 3.0:1；再往深走，悬停时按钮会**沉进背景**（上一版 #2a4ecf 只有 2.68:1）。所以深色主按钮的悬停在白字 AA 带内轻微**提亮**到 #3f63e6（白字 5.1、对页面 3.7、比静止亮 23%），按下才加深。#e07a7a / #ea9492 那对危险色同理 —— 深色危险按钮压的是墨字，底越深字越糊。规则本身不变（「状态变化不能牺牲可读性」），只是深色下「更可读」的方向是往亮。

### Neutral

- **Canvas** (#f9fafb): app background behind content.
- **Paper** (#ffffff): cards, surfaces, elevated panels, button faces.
- **Soft Gray** (#f3f4f6): minor surfaces, sidebar fill, table headers, segmented tracks.
- **Ink** (#0f1115): primary text and icons; secondary #61666b, tertiary #6b7078, disabled #9aa0a8.

  三级灰的取值由对比度定，不由「比二级灰更淡」定：浅色下它压在 #ffffff / #f9fafb / #f3f4f6 三种底色上都过 4.5:1（4.98 / 4.77 / 4.53），是**能过的最后一档**。再淡一格（旧的 #81858c 只有 3.55:1）就用字号和位置去拉层级，而不是让字掉到 AA 以下 —— 中文只有 400 / 700 两档真实字重（见 Two-Real-Weights Rule），层级本来就该由字号承担。禁用色 #9aa0a8（2.64:1）是例外：WCAG 1.4.3 不要求非活动控件达标，而 AntD 给文本按钮的 25% 墨色只有 1.8:1，几乎看不见。
- **Hairlines** (#e8eaed border, #eceef1 divider, #e2e4e8 l2, #d5d8dd l3): all 1px separations.
- **Interactive fills**: hover rgba(15,17,21,0.06), active rgba(57,100,254,0.10).

### Semantic (data and status only)

- **Income** (#16a34a), **Expense** (#dc2626), **Transfer** (#3b82f6), **Outlier/Warning** (#d97706), each with a 10% tint for tags and chip backgrounds.
- **状态**：待办逾期用 Expense，今天用 Outlier 圆点（文字保持墨色），完成用 Income 勾；设置里代理连通 Income / 失败 Expense / 有更新 Outlier。语义色只在数据与状态上出现，外壳、导航、品牌面永不上色。

### Ledger identity

Eight natural tones give each ledger a stable identity: forest #4a8e70, amber #c6963a, slate-blue #5c8db5, vermillion #d9705a, warm-brown #8c7b6e, ochre #9e8c7e, moss #6b9e7e, camel #b89a80. Dark theme lightens each for legibility.

颜色按账本 id 做 FNV-1a 哈希取模（`shared/domain/identity-color.ts` 的 `identityTone` / `identityColor`），同一账本永远同一色，不需要数据库字段或选择器。呈现只用一个 6px 圆点，放在账本菜单每一行的名称前；切换器里的头像不加点，保持头像本身居中。名称始终在点旁边，颜色不承担唯一信息。

**同一组色也给连板天梯的板块名用。** 板块名（涨停池的行业字段）按名字哈希取色，做成**文字**而不是圆点：因为 6px 圆点那套对比度标准撑不住 11px 小字，文字版是「70% 身份色 + 30% 墨色」，浅色下自动压暗、深色下自动提亮，两套主题都过 4.5:1。同一个板块在任何一列、任何一天都是同一色；颜色只是辅助，名字始终在旁边。

### Event identity (二十档内容色)

事件也靠颜色认人：卡左侧 3px 竖条 + 日期前 6px 圆点，颜色与名称同时在场。这二十档**不在 `tokens.css` 里**，因为它们是**内容**而不是 chrome —— 用户挑中的那一档（十六进制）会写进 `key_event.color`，所以权威来源是 `src/theme/event-colors.ts`，改色必须配一条迁移（`event_tone_contrast`）。

- **判据是 3:1，不是 4.5:1。** 圆点与竖条都是「有意义的图形」（WCAG 1.4.11），在纸白与画布上都要过 3:1。土黄 `#C6963A` 只有 2.57:1、橘黄 `#D48838` 2.72:1 —— 一列事件里最先糊掉的就是它们，各压暗一档到 `#B08534` / `#C17C33`（3.36 / 3.39:1），色相与名字都没动。老数据跟着迁移：用户选的是「土黄」这一档，不是那个具体十六进制。
- **深色往白里提 32%。** `.key-event-tone` 把 `--event-tone` 与白混合（`color-mix`，`[data-theme='dark']` 与系统深色各一条），与账本那八个身份色「深色各提亮一档」同一条规矩 —— 中间色调压在近黑底上会读成一团。提亮只会拉高对比度，所以深色不需要第二套判据；但提亮后仍是同一档色相（差 10° 以内），由 `tests/unit/event-colors.spec.ts` 盯着。
- **色板按钮与画出来的点用同一条规则**（`.key-event-swatch.key-event-tone`），否则选择器里看到的和卡上看到的是两个色。

### Series palette (九条色相)

折线图的一条曲线、饼图的一片，取的是**同一套**色板：第 N 条曲线 / 第 N 名 = 第 N 色。
画布、图例、右侧合计列读同一个索引，所以一条曲线或一片扇区的颜色在哪儿都一样。

**九条色相，每条只出现一次。** 前三条锚在支出红、收入绿、转账蓝 —— 与
`--transactions-color-expense/income/transfer` 同一批色相；其余六条是它们之间的过渡：
橙、黄、青、天蓝、洋红、紫。再加上「其他」那枚中性灰。

| # | Token | 浅色 | 深色 | 色相 | 明度（浅 / 深） |
|---|-------|------|------|------|----|
| 1 | `--transactions-color-series-1` | `#d27369` | `#ed978d` | 支出红 27° | .66 / .76 |
| 2 | `--transactions-color-series-2` | `#469b5d` | `#70b880` | 收入绿 150° | .62 / .72 |
| 3 | `--transactions-color-series-3` | `#6095d7` | `#85b4f0` | 转账蓝 255° | .66 / .76 |
| 4 | `--transactions-color-series-4` | `#b85e1a` | `#d2814e` | 橙 52° | .58 / .68 |
| 5 | `--transactions-color-series-5` | `#d2a40f` | `#ebbe43` | 黄 88° | .74 / .82 |
| 6 | `--transactions-color-series-6` | `#27b5a8` | `#69d3c6` | 青 185° | .70 / .80 |
| 7 | `--transactions-color-series-7` | `#d490cd` | `#f0b3ea` | 洋红 330° | .74 / .84 |
| 8 | `--transactions-color-series-8` | `#0389a0` | `#3fa8bf` | 天蓝 215° | .58 / .68 |
| 9 | `--transactions-color-series-9` | `#806bb7` | `#9d8cd0` | 紫 295° | .58 / .68 |
| — | `--transactions-color-series-other` | `#8b919a` | `#767d88` | 中性灰 | — |

四条成立的理由：

- **一个色相只占一个位置。** 上一版按「三族 × 三档」排，绿色出现了两次（150° 和 138°）：
  低色度下它们就是两个一样的绿，一眼分不出。色相重复一次，辨识度就少一档 —— 宁可换色相，
  也不在同一色相里再切一档。
- **锚在语义色上，中间补过渡。** 曲线少的时候（1–3 条）拿到的就是红 / 绿 / 蓝，预设图表的
  「支出 / 收入 / 转账」正好按这个顺序领到自己的颜色；第 4 条起是橙、黄、青这些过渡色，
  仍在同一条色相环上，不会突然跳到一个和语义无关的色相。
- **明度按色相链交替，不往下探。** 挨得近的色相必须靠明暗再拉开一档：红 .66 / 橙 .58 / 黄 .74
  就是这条规则推出来的。最深的一条只到 OKLCH L 0.58（对画布 4.3:1）—— 没有藏青、酒红、
  墨绿那一档；一张图里两个深色挨着时，色相先于明度失效，只剩两团黑。
- **颜色不承担唯一信息。** 图例是「色点 + 名称 + 金额 + 占比」，扇区之间有 1px 底色缝；
  颜色只做索引，名字永远在旁边。

判据由 `tests/unit/series-colors.spec.ts` 盯着（不再手抄）：前三条色相落在语义色 ±20° 内、
九条两两色相差 ≥24°、相邻两位 ΔE76 ≥30、任意两位 ≥23、明度带 0.55–0.85、色度 ≤0.17；
浅色下每片对画布 ≥2.1:1（其中至少五条 ≥3:1），深色全部 ≥3:1。

饼图还有一条渲染层的规矩：**扇区按令牌原值画**（`fillOpacity: 1`）—— G2 默认给 interval 打 95%
的填充不透明度，混进 5% 底色之后扇区比它的图例点浅一档（`#d27369` 会画成 `#d4746a`），
对比度也一起掉到 3:1 以下。

### Named Rules

**The Semantic Silo Rule.** Income/expense/transfer/outlier colors appear only on data and state — transaction amounts, stock moves, due/complete/connectivity — never on chrome, navigation, or brand surfaces.

**The Positional Colour Rule.** 一条曲线、一片扇区的颜色只由它的**位置**决定（第 N 条 / 第 N 名 → 第 N 色），与交易类型无关：一张图里同类型的曲线常常不止一条，按类型取色时第 4 条只能落到别的类型色上。折线图、饼图、图例与右侧合计列读同一个索引，所以同一个位置的颜色在哪儿都一样。

**The One Hue Per Slot Rule.** 一个色相只占一个位置：色板里九条色相各不相同，要更多颜色就换色相，不在同一色相里再切一档（两个近色绿在低色度下就是分不出）。三条锚色对准支出红 / 收入绿 / 转账蓝，其余是它们之间的过渡；明度按色相链交替，最深的一条止于 OKLCH L 0.58，因为一张图里两个深色挨着时，色相先于明度失效，只剩两团黑。

**The One Accent Rule.** Clarity Blue is the system's only accent color. There is no secondary accent; emphasis comes from weight and placement.

**The Row Bar Rule.** 记录表的交易类型用第一格左侧 3px 实色条标识（收入/支出/转账），整行不铺类型底色；行底色只留给 hover 与选中。类型文字与金额仍保留语义色。

## Typography

**Display Font:** Inter (Microsoft YaHei UI / PingFang SC for Chinese, declared in `--transactions-font-cjk`)
**Body Font:** Inter (same stack)
**Label/Mono Font:** JetBrains Mono (SF Mono, Consolas, Courier New)

**Character:** A clean geometric sans — calm, neutral, highly readable at small sizes — paired with a monospace face that makes numbers feel like data, not decoration.

**Two scripts, one voice.** Inter ships a Latin subset only, so every Chinese glyph is drawn by a system face. That face is *named* (`--transactions-font-cjk`, Windows → Microsoft YaHei UI, macOS → PingFang SC) rather than left to Chromium's own fallback list: unnamed, the primary reading face of a Chinese UI would silently change per machine. Latin and digits take Inter, Chinese takes the named face, money takes JetBrains Mono.

### Hierarchy

- **Display** (700, 28px, 1.2, −0.015em): page titles and key metrics; display-xl 36px for hero figures, display-sm 24px for section-level titles.
- **Title** (600, 20px, 1.4): panel and card titles; title-sm 18px for sub-headers.
- **Section** (600, 16px, 1.6): UI section names — 600, not 500: in Chinese a section has to be *bold* to sit above its body (see the Two-Real-Weights Rule).
- **Body** (400, 14px, 1.6): default content and table rows; body-sm 13px for dense lists. Continuous prose — event descriptions, 日记正文, 复盘模板 — also takes the body face: mono belongs to data, never to a paragraph.
- **Label** (500, 12px, uppercase, +0.04em): table headers, statistic labels, badges; small 11px for micro-labels.
- **Amount** (JetBrains Mono, 500, tabular-nums): every monetary figure; larger sizes use tighter tracking (−0.02em at title, −0.03em at display).

### Named Rules

**The Two-Real-Weights Rule.** For Chinese the system face ships only Regular and Bold: 400 and 500 resolve to the same face, 600 and 700 to the same face (measured through Chromium's platform fonts). So weight alone never carries a step in Chinese — a title is 600 (the real Bold), the step from body to label comes from size or colour, and 500 is kept for Latin and mono emphasis. Above 600 there is nothing to gain; widen the size or change the tone instead.

**The Automatic Spacing Rule.** The gap between Chinese and Latin/digits is the layout engine's job (`text-autospace: normal` on the root), not the copy's. 「1手」「1 手」「114字」「共 7 条」 all render with the same CJK/Latin rhythm, and editing copy can neither add nor lose it. Never pad copy with a hand-typed space to fake it.

**The Lined Figures Rule.** Tabular figures are the default for every numeral — `font-variant-numeric: tabular-nums` on the root, so dates, counts, percentages and round numbers line up column-to-column outside JetBrains Mono too. Amounts keep the Mono Money Rule.

**The Mono Money Rule.** Every monetary amount renders in JetBrains Mono with `font-variant-numeric: tabular-nums` and slightly negative letter-spacing. Never typeset money in the body face.

**The Panel Measure Rule.** Body text inside a panel fills that panel: 复盘 and note fields are read as itemised lines ("买入理由：…"), so they keep the width of the table above them — no `ch` cap, which in a panel merely shortens the wrap point and reads as content that failed to fill. Only continuous long-form prose caps its measure (事件描述, 75ch in `key_event.css`).

### Tracking tokens

Letter-spacing is tokenised per role — `--transactions-tracking-display` (−0.015em, display/title text),
`--transactions-tracking-label` (+0.04em, uppercase labels), and the amount ladder
`--transactions-tracking-amount` (−0.01em) / `-amount-lg` (−0.02em, money at title size) /
`-amount-xl` (−0.03em, money at display size). Prose takes no tracking. Line heights are tokens too:
`--transactions-height-tight` (display 1.2) / `-snug` (title 1.4) / `-normal` (body, label 1.6) /
`-relaxed` (long-form prose 1.8).

## Layout

The spacing scale is 8px-based (2 / 4 / 8 / 12 / 16 / 24 / 32 / 48). The app shell fixes a 48px top band, a 69px navigation rail (fixed collapsed: icon above label), a 56px sub-function rail, and a 44px footer; page content insets are 16px (full-bleed tables take 0 and pad their own cells). Data surfaces are fixed-sidebar layouts (`280px + minmax(0, 1fr)`；事件/日记的两侧轨用 `clamp()` 随窗口收放) or single-column stacks；设置页的字段组用 `repeat(auto-fit, minmax(200px, 1fr))`。多栏页面在 ≤1080px 收成一栏，个别三栏更早先收一档（≤1280 / ≤1200）；共享组件与记账/待办的窄窗兜底在 ≤820px / ≤720px。The window has no minimum size — the breakpoints above carry narrow widths, so they must stay live.

## Elevation & Depth

Light layering: surfaces separate by tone and 1px hairline borders; shadows are structural cues reserved for genuine lift. Cards rest flat on Paper with shadow-sm and lift to shadow-md on hover. Modals and drawers are the tallest layer (shadow-xl); focus is a 2px Clarity Blue ring.

### Shadow Vocabulary

- **sm** (`0 1px 2px rgba(0,0,0,0.05)`): resting cards, chips, segmented selection.
- **md** (`0 4px 12px rgba(0,0,0,0.08)`): hovered cards, dropdowns.
- **lg** (`0 8px 24px rgba(0,0,0,0.10)`): popovers, messages, notifications.
- **xl** (`0 16px 40px rgba(0,0,0,0.14)`): modals and drawers.
- **focus** (`0 0 0 2px rgba(57,100,254,0.25)`): keyboard focus ring on inputs and controls.

### Named Rules

**The Hairline Layering Rule.** Separate surfaces with tone and a 1px hairline first; add shadows only when a surface actually needs to lift (hover, popover, modal).

## Motion

Motion here is structural, not decorative: it says where a surface came from, that a change landed, or that a press was received. One curve carries all of it — exponential ease-out (`cubic-bezier(0.16, 1, 0.3, 1)`, `--transactions-ease-out-expo`), never bounce or elastic, and exits are instant (nothing waits for a closing animation).

| Beat | Applies to | Travel | Duration |
|---|---|---|---|
| **Enter** | panels and messages: modal, drawer, select / popconfirm / date-time panels, notices; **and the layers that open inside a page** — an expanded round body, an item's progress block | arrives from 4px above (drawer 24px from the side) | 200ms (`--transactions-transition-enter`) |
| **Settle** | the whole content area when a page or sub-function lands — once per mount, never per section | arrives from 8px above | 320ms (`--transactions-transition-settle`) |
| **Draw the data** | every data shape: 分析页的折线（`AntvLineChart`）与股票统计的累计盈亏曲线（`ChartBox`）走 G2 `pathIn`，折线上的点跟着出现；饼图（`AntvPieChart`）走 G2 `waveIn`，扇区从**各自的起始角**展开，单片实心圆用同一条节拍的 conic 遮罩扫出来 | the stroke draws along its own path, left to right; the pie fills clockwise | 620ms (`CHART_DRAW_ANIMATION` / `CHART_PIE_ANIMATION`), the surface's one authored moment |
| **Choose a row** | every row that answers "which one am I pointing at / did I pick": nav items, stock list rows, event cards, todo rows, table cells | colour only | 150ms (`--transactions-transition-fast`) |

**The Two Kinds of Arrival.** Masks and backdrops only fade (`tr-fade-in`, opacity alone) — a full-screen layer that moves reads as the window moving. Panels and messages arrive from 4px above (`tr-rise-in`); a whole content area settles from 8px above (`tr-settle`). Both keyframes end at their natural state and use no fill-mode, so content is visible even if the animation never runs. Arrival is always **from above or from outside**: entering elements are routinely exactly as tall as their container, so travelling down would add scrollable height to an `overflow: auto` parent and flash a scrollbar on the right edge.

**The Press Rule.** Desktop clicks have no native press feedback, so every button sinks 1px for 90ms: the primary/secondary/text variants (`.tr-btn`), icon buttons (`.tr-icon-btn`), and both navigations. The sink is the CSS `translate` property, never `transform` — 账本菜单的删除键、天梯的复制键、事件页的关联栏开关都用 `transform` 做定位（居中 / 贴边），写成 `transform: translateY(1px)` 会把它们的定位一起覆盖，按下时按钮跳走半行。 Hover, selected, and switch-handle transitions keep their existing timings (the 150ms band, colour only). Nothing animates a layout-driving property; the documented exception is the event linked rail's own column (`grid-template-columns`) and the progress bar's width.

**Budget.** Only transform, opacity, color and shadow animate; no scroll-driven motion, no parallax, no looping animation outside loading states, and loaders stop when their surface unmounts.

**描线只在看得清的时候播。** 那条 620ms 是给「一条能顺着读的曲线」定的：十几个点，眼睛跟着走。采样点上百之后，同一段时长里要画完一条几百段的折线，看到的只是面积在闪 —— 代价却是每一帧把整块画布重绘一遍。所以 `shouldAnimateDraw(pointCount)` 以 120 个点为界：密过这条线就直接画完，数据是同一份，只是不再表演它怎么长出来。股票统计页 400 个采样实测：描线时切过去 103ms 脚本，直接画完 44ms。

**Reduced motion.** `prefers-reduced-motion: reduce` collapses every beat to an instant state change (the global cap in `base.css`), so focus, colour and state still land. The chart asks the media query itself and turns its draw off (`animate(false)`) instead of leaning on the global cap: a 620ms stroke cut to zero by an override could leave the line hidden. 饼图的单片实心圆是 CSS 遮罩画的，就吃那把全局兜底（0.01ms 直接落到整圆）。

**加载指示器是唯一不吃那把兜底的东西。** 无限旋转压成 0.01ms 之后是一个静止的圆环 —— 一个正在请求的按钮看起来和空闲一模一样，而「还在忙」这件事只有它在说。所以 `.anticon-spin`（按钮里的加载图标）与 `.ant-spin-dot`（独立 Spin）换成**不位移**的替代：1.6s 的明暗呼吸（`tr-busy-pulse`，透明度 1 ↔ .4）。空间移动照旧归零 —— 减少动态要的是「别晃」，不是「别告诉我在忙」。

## Performance

本机读盘，没有网络时延；真正花时间的是**启动时把所有代码解析一遍**。所以这里只有一条规矩：

**页面按需加载，重心不进外壳。** 八个页面在 `App.tsx` 走 `React.lazy`（一次只挂一页），`Suspense` 的兜底是 `null` —— 本机 `app://` 读一个 chunk 只有几毫秒，插一块骨架反而会闪。路由级拆分把入口从 6.5MB 压到 2.4MB：G2（约 2.7MB，分析页与股票统计）与页面各自的表、弹窗因此只在真正打开那一页时才解析。`Suspense` 的边界画在 `PageRailProvider` **里面** —— 画在外面的话，每次切页都会把侧轨的展开状态与工具栏宿主一起重挂。外壳、antd 与共享令牌留在入口，拆它们只会把启动摊成更多个请求而对首帧没有帮助。

**按需加载就得配一句失败的话。** 拆成 chunk 之后多了一种新的坏法：某个 `assets/*.js` 读不到（安装包损坏、被安全软件拦下、更新写到一半）。`React.lazy` 会让 `import()` reject，没有边界时 React 卸载整棵树 —— 窗口只剩标题栏，用户只能强杀。所以每个分页外面套一层 `PageBoundary`（`components/page-boundary.tsx`）：坏掉的只有这一页，换成「这一页没有加载出来」+ 「重新加载」与「关闭窗口」两条路 —— 文件只是没读到就重载，真读不到时关掉应用重开才是出路，否则这个按钮会把人困在原地循环；外壳、导航、账本菜单、底栏都还在，切走再回来边界自己重置。健康路径上它不产生任何 DOM 节点，落位动画仍然落在页面根元素上。

**重的东西不许留两张。** 股票统计的「展开」大图关掉就销毁（`destroyOnHidden`）：留着它，之后每次换指标 / 换范围都要重画**两张** G2 画布。同一页里两张同源画布是纯浪费，不是"预加载"。

**打字不触发重算。** 一输入就重算的筛选（股票统计的「最近 N 笔」）把一次输入拆成三次 IPC、三遍查询、三遍整图重绘 —— 实测三位数 101ms 脚本。停下来 250ms 再提交（`recentText` → `recent`），下拉、分段这些一击即中的筛选照旧即时。

## Shapes

Gently curved, consistent radii: 6px for tags and dropdown items, 8px for buttons, inputs, and menus, 12px for cards, popovers, and messages, 16px for modals and drawers, 9999px for switches and pills, and 20px for chat bubbles. Borders are always hairlines — never heavy outlines.

## Components

### Buttons

- **Shape:** 8px radius; heights 28 / 36 / 44px (small / default / large); default min-width 72px.
- **Primary:** solid Clarity Blue, white text, padding 0 16px. **Hover 加深到 #2b52e6（6.1:1）、按下到 #1e40c8（8.0:1）** —— 白字压在按钮上，往亮走就掉出 AA。深色例外：悬停提亮到 #3f63e6（白字 5.1、对页面 3.7），因为那里的页面已经近黑，再深按钮就沉进背景了。
- **Secondary (default):** Paper face, 1px hairline border, ink text; hover adds a soft fill (hover-bg).
- **Text:** neutral secondary text, hover fill; text-danger turns Expense on hover with a danger-tint fill.
- **Disabled:** 控件自身的禁用色一律用 `--transactions-color-text-disabled`（浅色 ≈2.6:1）。AntD 给文本按钮的 25% 墨色（≈1.8:1）在纸白上几乎看不见，`antd.css` 里按 text 变体把它拉回令牌 —— 只改 text 变体，主按钮的白字与危险按钮的红字不动。
- **Primary danger:** solid Expense, white text; hover 加深到 #c81e1e、按下到 #b01818（白字 5.7 / 7.0:1）。**深色下例外**：深色的 Expense 是亮红 `#f87171`（它主要给数字和状态当文字色），白字压上去只有 **2.8:1**。所以实色危险按钮在那里的字色换成墨色 `#0f1115`（**7.8:1**）—— 这也是 AntD 自己对「亮底实心按钮」的处理（`isBright` 时转黑字）。一个红色没法同时当「深底上的文字」和「压白字的实心底」，两个角色就分两个值：`--transactions-color-expense` 管前者，`ANT_PALETTES.dark.dangerInk` 管后者。字换了墨色之后，悬停 / 按下也只能往亮走（6.5 / 8.2:1）：底一深，墨字就掉出去。
- **Focus:** 2px Clarity Blue outline, 2px offset, on `:focus-visible`.

### Cards / Containers

- **Corner Style:** 12px radius.
- **Background:** Paper; borders 1px hairline (window-border).
- **Shadow Strategy:** shadow-sm at rest, shadow-md on hover.
- **Internal Padding:** 24px (space-xl).
- **Flat pages:** 待办、事件与股票 are flat: list rows, detail panes, metric strips, and rails sit directly on the canvas with no card face or shadow, separated by 1px hairlines and 40px Soft Gray bands; 16px is the inset for bands, rows, and tables. Cards stay for records, settings, and popover layers.
- **Nested rows:** 展开在事项下的子块（待办的进度记录）缩进到父行**标题文字的竖线**：16px 行内边距 + 20px 勾选框 + 12px 行内间距 = 48px。子项自己的勾选框落在这条标题列上，而不是和父级勾选框排成一列 —— 两者同宽同列时，两块看起来是兄弟而不是父子。子块的左差写成「勾选框宽 + 行内间距」的算式，改勾选框大小时缩进跟着走；上边那条 1px 发丝线仍从父行左边缘起笔，分节关系靠它、缩进关系靠左差。
- **Section collapse:** 待办的主题段头带一枚常驻的 chevron（朝右 = 收起，转 90° = 展开），点它或点**段头整条**（标题、计数、留白）都能收掉整段事项，只留 40px 段头与「N 项」；段头因此给 `cursor: pointer` 与 `hover-bg` 的悬停反馈（空段两样都不给 —— 没有可收的东西，就不假装能点），拖拽把手、悬停才出现的「＋ / 删除」和 chevron 各自接住自己的点击，不触发切换。段头标题与事项标题共用**同一条竖线**（16 + 20 + 12 = 48px）：把手因此占一个 20px 的格子、图标在格里居中，和事项的 20px 勾选框同列。chevron 落在段头右侧的图标列里，和事项行的 chevron **同一条竖线**（24px 控件 + 12px 间距，段头的「＋ / 删除」也用 24px，否则整列会错开 8px）；那两个悬停控件始终占着自己的位置，所以 chevron 不会左右跳。收起的段自己补一条发丝线收口 —— 段与段之间本该由事项行分界，两条 Soft Gray 横带直接相邻会黏成一整块；这条线用 `border-l2` 而不是 `divider`，因为 `divider`（#eceef1）压在横带（#f3f4f6）上只剩 1.5% 的明度差，等于没画。空段不出这枚按钮、也不举手型，往收起的段里加事项时先把它展开（否则新事项落在看不见的地方）；收起状态只活在这一次会话里，不写库、不写配置。工具栏里「新建主题」左侧的**全部展开 / 全部收起**是同一动作的批量版，用 text 按钮（比主按钮低一档、簇间距与其余页面一致取 12px），没有可做的时候就置灰 —— 一排主题时它省掉逐个点的力气，一个可做的都没有时它也不假装能点。
- **Row as the toggle:** 事项行**整条**都是展开/收起的热区 —— 标题、行尾留白、6 / 16px 的内边距都算，整行 `cursor: pointer` 就是这个承诺的可视化。行内的勾选框、编辑、删除、chevron 各自接住自己的点击，不再触发切换（命中行内 `button / input` 就放行）。只把标题文字做成按钮、留着内边距当死区时，用户点在行尾留白上会以为这个功能坏了。

### Inputs / Fields

- **Style:** Paper face, 1px hairline border, 8px radius, 36px height, padding 0 12px.
- **Errors are spoken.** 错误段落一律带 `role="alert"`：红字插进 DOM 的那一刻读屏也要念出来，否则对看不见的人「什么都没发生」。能落到某个字段上的错误（「金额（元）」输错、价格非法）再给那个输入框挂 `aria-invalid` 与 `aria-describedby` 指回错误段的 id —— 焦点回到框里时也听得到原因，范例见 `stock.tsx` 的金额弹窗。全仓 31 处错误段落由 `tests/unit/status-messages.spec.ts` 扫源码盯着，新加一处忘了带 role 就会红。
- **Focus:** border turns Clarity Blue with the 2px focus ring.
- **DatePicker / Select:** same height and radius; hover darkens border to l2.
- **Rows of fields:** size the **fields**, not the row. `.ui-input` is `width: 100%` and an `<input>`'s intrinsic width (its default 20-character size, ≈181px here) is that field's *automatic minimum*, so "give the row a width and let the fields shrink" cannot work: a fixed 260px row of two month fields overflowed and the next control painted over the second one, leaving 「结束」 visible. Each field takes `flex: 0 0 <n>px` **plus `min-width: 0`** (without it the automatic minimum wins and the basis is ignored) and the row sizes to its content — 168px holds 「开始月份 YYYY-MM」 with its 12px padding on both ends.
- **Writing surface (prose, not a field):** a paragraph-length note gets its own paper — `ModalSize::Large` (640) with a body ≥320px tall, growing with its content up to 60vh. **At rest it must never clip:** the shell runs WebView2's *overlay* scrollbars (see the scrollbar note in `base.css`), so content taller than its box reads as content that is gone. 320px is the arithmetic, not a taste: 640 − 48 padding = 592px of measure, ~42 CJK glyphs per line at 14px, 1.8 line-height → 500 characters ≈ 12 lines ≈ 302px. Ship a live character count (`util::char_count`, the same ruling as the server), `Ctrl+S` to save, `Esc` to leave, and focus plus caret placed on open — a writer should never click into the field they just asked for.

### Navigation

- **Style:** 56px left rail, 18px icons with labels; inactive text-secondary.
- **States:** hover fill (hover-bg); active item gets active-bg tint with Clarity Blue text, 8px radius.

### Tables

- **Header:** Soft Gray, uppercase caption (+0.04em, 600), hairline bottom border.
- **Rows:** 14px body, hairline dividers; hover hover-bg; selected active-bg.
- **Header total:** 表可以在标题行右侧带一句汇总（成交记录标题右边的「费用合计 ¥50.10」）：标签 12px 三级灰、金额等宽主文字色，右对齐到表的右边缘，和表里那列数字同一档字号。汇总跟着表里的行走 —— 同一份数据、同一套分→元格式化，不另算一遍；表里没有行时整句不出现，不留一个 ¥0.00 假装有账。
- **One-line reviews:** 每日复盘（持仓详情与记录里的那一轮共用同一种读法）一天一条、最新在上，每条只占一行（日期等宽、正文 13px，超出省成省略号）；点整条弹出只读弹窗看全文（`pre-wrap`、最高 60vh 自己滚）。列表不做就地展开 —— 复盘可能很长，展开会把下面的本轮复盘和成交记录顶走；也不做折叠按钮，一天一条本来就该扫一眼。行是按钮：悬停有 hover 底、键盘能聚焦、焦点环 2px，读屏名是「查看 2026-10-30 的每日复盘」。空着的时候那一行也还是按钮：点它就是「写今日」（记录里不能写，那一句是陈述，不做成按钮）。两处看的是同一批复盘，一处能点开、一处只能顺着读会让人以为记录里丢了内容。
- **Editing a day:** 持仓时读全文的弹窗底下多「关闭 / 编辑」两颗：**编辑换的是同一天**，标题带日期，日期位置写成一枚静态值 —— 允许改日期等于让一段文字悄悄盖掉别人那一天，而灰掉的日期选择器字色只有 ≈1.8:1、还暗示它本该能点，所以那一位干脆不做成控件。保存后那一行与库里那一行一起变，不追加第二条，确认语是「复盘已更新」（「写今日」仍是「复盘已保存」——两个动作分开说）。记录里那一轮没有这颗按钮：轮次收尾后服务层就拒绝再改（「该股票已清仓，每日复盘不可再编辑」），摆一颗按下去只会报错的按钮不如不摆。也不另给「删除」：把正文清空再保存就是删掉那一天，和「写今日」同一套语义。
- **One-line round review:** 本轮复盘同一套读法：一行只读（放不下省略号），点整行弹窗看全文；「编辑」把编辑器放进弹窗（6 行输入 + 取消 / 保存复盘），保存后弹窗关闭、那一行跟着变。不再在段落里就地铺开长文 —— 一段长复盘能把下面的成交记录顶出屏幕，而它通常只在回顾时才看全文；空复盘那一行显示「还没有写本轮复盘，点「编辑」记录买入与卖出的理由。」，点它直接进编辑器。
- **Expand caret:** 记录页每一轮的展开 / 收起是**同一枚实心三角**：收起朝右、展开朝下，就是同一枚转 90°（`transition` 只动 `transform`），12px 三级灰。不换字形 —— 细箭头和实心三角一个轻一个重，切一次状态就换一次分量；这也是这一页唯一的箭头形状。
- **Round fee:** 记录页的轮次行把同一句「费用 ¥15.71」贴在盈亏左边（12px 次要色、金额等宽），**收起时也看得到** —— 轮次行是这个回合的摘要，费用不该只在展开后的表里才出现。它用 `margin-left: auto` 占住右侧那组数字的起点，所以「几笔成交」留在左边、费用与盈亏一起靠右；和盈亏之间比行内默认间距再松 4px，两个金额贴着会读成一个数。
- **Narrow tables:** 窄窗里列放不下时，表格按内容宽度排、在自己的容器里**横向滚**，单元格一律 `nowrap` —— 把 `1680.00` 压成「168 / 0.0 / 0」比截断更难读，也比多一根横向滚动条更糟。持仓详情的成交记录、记录页的轮次表、资金变化表都走这条路：表格 `min-width: 100%` 保证宽窗时铺满，窄窗时由外层的 `ScrollArea axis="both"`（或轮次体的 `overflow-x`）接管。
- **Scrolling:** 面板里的表（持仓详情的成交记录）**吃掉容器剩下的高度**、自己在容器里滚，表头贴住滚动区顶边（AntD `sticky` + `getContainer` 指到 `ScrollArea` 的视口；CSS `position: sticky` 在 AntD 的 `.ant-table-container` 里不管用）。整块详情不跟着滚 —— 一屏里只有最下面的表在动、上面的行情与复盘却跟着跑，读的时候每滚一格都要重新找表头。表格区保住一个下限（表头 + 三行左右，180px），再矮就让上面的信息区自己滚，绝不把表挤没。

### Charts (分析)

- **时间范围是这一页的上下文，不是偏好。** 分析页默认月粒度 + 本年（触发器写 `2026-01 ~ 2026-12`），记录页默认今天；两页各记各的，切页（页面组件卸载）回来仍是上一眼那段范围 —— 记忆放在模块级 `useSessionTimeRange`，只活到这次关掉应用，不写 config。只记选完的那一段：半选（只有起点）是正在挑的中间态，切页回来留一张空图表比回到上一段完整范围更糟。股票天梯不接这个 —— 它默认最近交易日，记住翻到的旧日子只会看到空数据。

- **两张预设图表，只可删。** 账本里只播种「月度消费趋势」与「年度消费趋势」两张（`is_preset = 1`），**一个账本只播种一次**（`app_meta` 里留 `chart_seeded:<ledgerId>` 标记）：用户把预设删掉之后，回到这一页不会再长出来 —— 能删的东西不该自己回来。预设的曲线与粒度由系统给定，因此标题行不出现「重命名」、粒度选择器置灰、曲线表不出现「添加曲线」与操作列 —— **不加说明文字**，缺了能改的控件本身就是那句话。列表项上的删除气泡照旧可用；服务层同样拒绝改预设的标题 / 粒度 / 曲线，报「预设图表不可改名、改粒度或改曲线，只能删除」。
- **折线是走势，点是采样。** 每条曲线 2px、只连自己的点；同一条时间上的点是**小的实心圆**（半径 2.5、与线同色、填充不透明）。G2 的 `point` 标记默认形状是 `hollow`，3px 半径下只剩一道白环，看着像还没加载完的占位。点本身不开提示（提示是整条的：悬停只亮一条竖线 + 一张按时间汇总的表），所以点只负责「这里有一个采样」。股票统计的累计曲线（`stock-statistics.tsx`）用同一套点，两个页面不各写一份。
- **盈亏两色走语义令牌，并跟着主题重取。** 股票统计把曲线在**零点**切开：上方盈 = 支出红、下方亏 = 收入绿（与股票页 `.is-up` / `.is-down` 的红涨绿跌同一条语义）。这两个值取自 `--transactions-color-expense` / `--transactions-color-income`（`chart-colors.ts` 的 `profitLossColor`），不再写死十六进制 —— 画布读不到 CSS 变量、也不会自己跟着主题重画，所以 `ChartBox` 拿 `useThemeMode()` 当 effect 依赖，换主题时整张图重取一次色。（此前写死的 `#e5484d` 既不是令牌里的那个红，也不随主题变。）
- **饼图是构成，折线图是趋势。** 新增图表时先选类型：折线图（默认）看时间上的走势，饼图看「这段时间里各组分了多少钱」。饼图**没有时间粒度、没有曲线** —— 标题行不出粒度下拉，底部「曲线配置」换成「分组配置」（分组字段 / 按分类时才出现的交易类型），改动即整行回写、不设保存按钮。分组三种：按交易类型（支出 / 收入 / 转账各一片，取色板前三位 —— 色相与记录页的金额、曲线配置里的类型芯片同源，见上文「Series palette」），按分类（一次只统计一种交易类型，第 N 名取系列色板的第 N 位），按标签（要再点名一种交易类型和一个分类，只统计那个分类下**带标签**的记录：标签挂在记录上，一笔记录有多个标签就进多片、金额各算一次，没有标签的记录不进任何一片 —— 所以合计可能大于实际支出，这种重复计入只在真的发生时在合计列下面补一句「多标签的记录会重复计入」，平时不占一行）。组数超过 9 时前 9 组留在图上、其余折成一片「其他（N 组）」，图上与右侧「分组合计」读**同一份**折叠结果；那一列就是饼图的图例（色点 + 名称 + 金额 + 占比），因此**不可收起** —— 收起之后没人分得清哪一片是哪一组。画布不排文字标签（中文名挤不下，标签全在合计列），直径钉在 520px：比例靠一眼看出，不靠面积。悬停一片只给一句话：分组名 + 金额 + 占比 —— 不排 `amount` / `share` 这种字段名，也不再画两枚同色圆点，图例已经在右边把账算清了。空态按三级说：整个范围没有记录是「这个时间范围里没有记录，换一个范围试试」；有记录但没有这一种交易类型 / 分类是「这个范围里没有「支出」记录，换一种交易类型看看」；有记录、这一组却没有标签则是「……的记录都没有标签，先给记录加上标签」——三句话说三种下一步。只有一组时画实心圆而不是 360° 扇区 —— 扇区会沿起始半径留一道 1px 的抗锯齿缝，整圆看着像裂开了；它同样扫出来（conic 遮罩，同一条 620ms）。扇区只在**数据变了**的时候重扫（换分组、换时间范围），换主题只换颜色、不重扫。预设图表仍然只有折线图；折线图 ↔ 饼图之间不互通，要换就新建一张。
- **自建图表的曲线就地增删改。** 曲线表右上角一颗「添加曲线」（28px 次要按钮、加号图标），只在非预设图表出现；行尾「编辑 / 删除」是两颗 text 按钮，删除过一个 `Popconfirm`。一次改动就是一次写入（`chart_update` 整行回写），不设「保存修改」：曲线表没有草稿态，也就不会出现「忘了点保存」的静默丢失。新增 / 编辑共用一张 560px 弹窗：曲线名称、交易类型、分类、标签、标签匹配、描述包含、包含离群值；三项条件都留空就是「不限」。分类与标签按 `分类:交易类型` 联动（`shared/domain/tag-names`），换交易类型会清掉已选分类与标签。曲线名称在同一张图里唯一，重名时弹窗里直接说明「已经有名为 X 的曲线」，不写库。曲线删空时，画布只留一句安静的话（「加一条曲线之后，这里会画出趋势。」），不摆第二个空态插画 —— 同一屏两张文件夹图看着像两处坏了；要说的那句「还没有曲线」交给下面的曲线表，它旁边就有按钮。

### Ladder sheet（导出网页）

- **同一套世界，另一张纸。** 天梯工具栏的「以网页打开」把当前这一份天梯渲染成一张自包含的 HTML：纸面 `#f9fafb`、墨色 `#0f1115`、唯一主色 `#3964fe`、语义红绿、Inter + JetBrains Mono、发丝线、无阴影。浅色是纸；深色跟 `prefers-color-scheme`；打印一律落回浅色。颜色是从令牌算出来的字面量（`ladder-page.spec.ts` 逐条比对 `tokens.css` 并算对比度），页面不继承软件样式。
- **段从高到低。** 软件里首板在左（时间顺序），网页是给「读这一天」的：空间板在最上，7 板 → 1 板往下递减，一个板数一段。段内仍是软件的板块分组顺序，断板跟在同板块的连板后面；同段卡片横排（`auto-fill minmax(208px, 1fr)`），1440 宽一段排得下五张。
- **板数就是台阶。** 每段左边的数字随板数放大（`18px + 板数 × 5px`，封顶 58px，左轨 112px），从上往下数字一段比一段小 —— 台阶是数字自己排出来的，不是画出来的；每段的卡片都从同一条竖线起排，段与段之间只有一条发丝线。家数 / 晋级率 / 断板数（11px 等宽、一行一项）压在数字下面，和它说的是同一件事，不散到页面另一头。最高板只靠字号大，不加颜色（与软件 `is-top` 同一条规矩）。
- **板块色是纸上自己的八个色相。** 卡片底色不用软件里的账本身份色 —— 那八档里有四档是暖褐（琥珀 / 暖褐 / 土黄 / 驼色），铺成卡片就是四张分不出来的米色。纸上另起一套：八个色相（OKLCH 20° / 65° / 110° / 155° / 200° / 245° / 290° / 335°）等明度、等彩度，只有色相在走 —— 浅色卡面是 L 0.93 / 彩度 0.06，深色是 L 0.30 / 0.055，八张卡一样重，谁也不比谁淡。色值写死在 `LADDER_BOARD_PALETTES`，单测逐个算对比度（正文、代码行、板块名 4.5:1，汇总圆点 3:1、描边 2:1）并盯住两两底色 ΔE76 ≥ 10 —— 「分得开」是算出来的，不是眼睛觉得。
- **一个板块一个色相。** 槽位按板块名哈希（同一个板块换一天大概率还是同一色），同一天撞到同一个槽就顺延到下一个空槽：这张纸只讲一天，一天之内彼此分得开比跨天稳定更重要，超过八个板块才开始复用。汇总条上的圆点用同一批槽位，那一排就是这张纸的图例；颜色仍不单独承担信息，每张卡都写着板块名。
- **断板是虚线框。** 断板卡片的描边改虚线、底色取同一色相浅一档：实线 = 今天还在板上，虚线 = 今天断了。先按结构分两堆，再读「断」与当日涨跌幅；描边对自己的底色 2:1 起，深色下也看得见，不再靠「淡一点」区分 —— 淡到分不出就等于没有区分。
- **标签的面是白的。** 卡片本身是彩底，粉卡上再压一层粉色「一字」会整块消失，所以标签统一用一层半透明白（浅色 55% / 深色 10%）当面，语义只由字色承担（红 / 绿 / 琥珀，62% 墨 + 38% 语义色）；这层白下面的每一种卡面都算过 4.5:1。代码行与封板时间也跟着板块色相走（`--card-sub`），不在彩底上压中性灰；断板卡片的名称与价格用同一个色，退一档但不掉到灰。
- **涨停的名字与价格是红的。** 涨停卡片上的股票名与价格用语义红（`--rise-ink`：84% 语义红 + 16% 墨 —— 浅色 `#bb2323`、深色 `#f78687`），和断板那枚涨跌幅标签是同一条「红涨」语义。纯正红 `#ff0000` 压在八张彩卡上只剩 3.1:1，所以取的是能过 AA 的最亮一档：色相仍是 0°，红得没有偏棕。断板的名字与价格退回板块色的次要字（`--card-sub`），红只给还封在板上的 —— 断板是「昨天封住、今天没封住」，它的红/绿由当日涨跌幅标签单独说。
- **价格要说清是哪一刻的。** 连板股用涨停池里的最新价（收盘后即收盘价、盘中是抓取那一刻的当时价）；断板的价格与涨跌幅同源（同一笔当天行情，日期对不上就不显示，绝不拿昨收顶上）。页脚写「数据来源 / 抓取时刻 / 定稿状态 / 价格口径」，日期行写「收盘后定稿」或「盘中快照」。
- **自包含 + 可打印。** 不联网、不引外部资源；唯一的脚本是「打印 / 存为 PDF」（`window.print()`），`@media print` 隐藏它、强制浅色、把每段压成「板数 + 家数一行，下面横排卡片流」（184px，可跨页、卡片不跨页）。字体由主进程从构建产物里以 base64 内嵌（开发模式取不到就退回系统字体），文件写到系统临时目录 `transactions-ladder-<date>.html` 再交给默认浏览器。窄屏（<1100px）左轨与数字一起收窄；<760px 板数与家数排在同一行、卡片落到下方一列。按钮只在当天有天梯数据（`status === 'ok'`）时可点。

### Media

- **Photo is shown whole:** 事件主图按 `contain` 完整显示 —— 这一格是"看这张照片"的地方，宁可两侧留底色也不裁；留白由同一张图放大、模糊 24px 垫底，灯箱里是同一套底衬（48px）。缩略图反过来用 `cover`：它是 160×90 的导航槽位，要的是整齐一列，看清照片交给主图和灯箱。
- **Thumbnail is a button:** 侧栏每一格缩略图**本身就是按钮**，不是「一个恰好带 onClick 的 `<img>`」：铺满槽位、Tab 能到、Enter / Space 能切，选中态由 `aria-pressed` 表达（`is-selected` 只管画边框），读屏名是「查看第 N 张图片，共 M 张」。里面的 `<img>` 因此 `alt=""` —— 名字在按钮上，图再报一遍就成了两遍。删除键是它的**兄弟**、绝对定位叠在右上角：按钮套按钮是无效 HTML，Tab 顺序也会乱；这也和「代码按钮叠在股票卡片上」同一条规矩。焦点环挂在按钮上并**内缩 2px**（双环：外圈这一主题的墨色、内圈主色）：槽位是 160px 宽的滚动视口，向外扩的环会被裁掉；压在照片上的单色环遇到同色照片会整圈消失，两圈叠着才在任意底片上都有 3:1（`::after` + 两条 inset 阴影，不参与点击）。
- **HEIC:** iPhone 的 HEIC 在 Chromium 里没有解码器（Windows 相册能开是系统装了 HEIF 图像扩展）。导入时主进程用 libheif（wasm）解成 RGBA、编成 JPEG q92 当展示图，缩略图从同一份像素缩到 300 宽；原图按字节原样留一份（`<uuid>.heic`），「保存图片」给的是看得见的那份 JPEG。转码只在导入时发生一次，列表与灯箱之后都读 JPEG。
- **Live photo:** 实况是「同名照片 + 同名 MOV」两个文件：选文件时多选、按文件名主干配对，只有视频没有照片时不做猜测，直接提示「实况视频要和同名的照片一起选」。动态部分单独存（`<uuid>.mov`），主图左下角一枚「实况」胶囊按钮 —— 点一下在原位播放，再点、点视频本身或播完就回到静态照片；打开灯箱时主图那层重挂一次，声音不会在预览背后继续。缩略图左下角配一枚更小的「实况」角标（遮罩色 + 白字），和右上的删除按钮分居两角。播放在 `trasset://` 上走 Range（206 + `content-range`），`<video>` 才能拖进度，CSP 因此多了 `media-src`；HEVC 能不能解取决于系统解码器，解不了就明说「这台电脑缺少 HEVC 解码器」，不装作在播。

### Tags / Chips

- **Style:** 10% semantic tint background + semantic text, 6px radius, no border, 2px 8px padding.
- **Move tag:** 连板天梯的断板条目在「断」后面带一枚当日涨跌幅标签 —— **红涨绿跌**（与股票页 `.is-up` / `.is-down` 同一套 Income/Expense 语义），数字用等宽字体与 `tabular-nums`，一列里的百分号对齐。涨跌幅问的是当天行情，没有当天行情就不显示这一枚，绝不拿别的交易日顶上。
- **Price:** 天梯每一行在股票名右边带一枚价格（等宽数字、主文字色；断板行跟着整行退成次要色）：收盘后是**当天收盘价**，盘中（`temporary`）是抓这份池子那一刻的**当时价** —— 页面状态行已经说明这份数据是盘中快照还是定稿，卡片上不再重复写「收 / 现」，读屏用一枚视觉隐藏的标签补出「收盘价 / 当时价」。连板股的价格就是涨停池里的最新价；断板不在池子里，价格与涨跌幅同源（同一笔当天行情），没有当天行情就整格不显示，绝不拿昨收顶上。价格放在名称这一组里、不进右边那一簇（代码 + 时间）：7 板时一列只有 ~180px，代码 + 时间 + 价格会一起溢出，名称那一行还放得下 —— 名字太长时先截名字。
- **Board label:** 天梯每一行的第二格是板块名（涨停池的行业字段），**纯文字 + 身份色**、无底色无边框，用 11px 小字压在标签行的最左边。整列先按板块聚在一起（同一板块相邻），板块名就是这一组的抬头；同一板块同色、不同板块不同色，颜色永远不单独承担信息。板块之间按该组最早封板时间排，只有断板的组整组落到最后。
- **Board summary:** 工具栏下面压一条**板块汇总**窄带（发丝线收口）：一串「板块名 家数」，只数当天的涨停股（断板不算），家数多的板块在前、同数按名字。不加「板块」这类小标题 —— 一排板块名摆在工具栏和列之间，本身就是抬头。板块名沿用行里那套身份色 —— 汇总里认得出的颜色，滚到列里还是同一块。家数用等宽数字，弱成次要信息。
- **Limit-up row:** 今天还在板上的行铺一层**微红底**（`expense-tint-soft`，6% / 深色 10%），断板行不铺底 —— 一列里哪些是今天封住的、哪些是昨天断了的一眼分得开。这层底比行上的标签底色（10%）更淡，不许把「一字 / 炸 / 涨跌幅」压下去；行分隔线仍是一条 1px 发丝线，底色不替代分隔线。底色铺到列的内边缘（左右各留 4px），行内文字再缩进 8px、与列头落在同一条竖线上 —— 文字永远不贴着底色边。
- **Name is a refresh, not an edit:** 股票名称是行情源的**显示名**，代码才是身份 —— 除权除息当天它会变成 `XD工商银`，摘帽、更名也会换名字。详情头里代码右边那枚 20px 刷新按钮（三级灰、悬停亮主色，请求中图标自转）按代码去行情取一次当前名称，写回账本里该股的持仓行、成交行、历史集合与心得，然后**就地改名**，不重拉整页（会丢掉展开的轮次与滚动位置）。名称没变也回一句「名称未变」—— 点这一下不该像没反应。**账本文字不改**：资金变化记录与操作日志里的「买入 浦发银行 1手」是当时那笔的快照，换名字不该改写历史。
- **Copyable code:** 天梯每行的股票代码、持仓与记录左栏卡片右上角的代码、详情标题里那一段代码都是**按钮**：点一下把代码写进系统剪贴板，回执是一句「已复制 300xxx」。静止时它是次要色 + 等宽，和旁边的时间戳同一档，悬停才亮主色 + 下划线 —— 一排里能点的只有这一处，不该让它看起来比股票名更重。卡片本身是「选中这只股票」的大按钮，代码按钮是它的**兄弟**、叠在它上面：按钮套按钮是无效 HTML，Tab 顺序也会乱；点代码只复制，不切换选中。写剪贴板走主进程的 `clipboard_write_text` 命令，不依赖渲染层的剪贴板权限。
- **Copied ledger:** 交易台账的「复制到剪贴板」给的是**纯 Markdown，只有 `##` 标题与无序列表，没有表格** —— 粘到笔记、聊天、提交说明里都不会被当成需要列宽的东西。第一段是台账的十个字段（`为什么买` … `一句话`），第二段 `## 成交记录` 一笔一条：`日期 · 类型 · 手数 · 成交金额`（`2026-10-13 · 建仓 · 2 手 · ¥5498.00`），按成交时间从早到晚；没有成交时整段不出现，不留一个空标题。字段里的空值写破折号、卖出未清仓写「清仓后回填」、多行文本续行缩进两格 —— 复制出去的那份与只读页说的是同一句话。
- **Identity dot:** 6px 圆形、无边框、只做身份辅助；账本与事件各用自己的稳定色，旁边始终有名称。
- **Editable tag (chip button):** when a tag is something the user can change, it keeps the tag face (caption, 6px radius, `minor-background`, 2px 8px) and gains an 11px caret plus a 22px minimum height so it is a fair pointer target — a bordered 36px field parked in a title row reads as an unfilled input, not as that row's tag (`ui-select--tag`). Both places a round's tag can be changed wear the same chip: the position detail header and each round's header on 记录 — in the latter the chip rides the right end of its row, so its panel opens leftward (`right: 0`) rather than past the window edge. Hover steps the fill to `active-bg` with primary text; open and keyboard focus add the focus ring. Its panel is sized to the widest option, so a long custom tag never wraps inside a narrow chip.

### Tabs

- **Style:** active tab is Clarity Blue text on an `active-bg` tint fill (8px radius, medium weight) — `.ui-tabs__tab.is-active`.

### Modals / Drawers

- **Style:** 16px radius, shadow-xl, header/footer hairline-divided, title 18px 600.
- **Width — three tiers only:** Small 400, Medium 520, Large 640 (`ModalSize` in `components/ui/modal.rs`, mirrored by `.ui-modal__content--sm|md|lg`). Pick the tier from the content, never a one-off pixel width: Small for confirmations and single-field forms, Medium for short forms and pickers, Large for multi-field forms and filter builders. Omitting the prop means Medium. Every modal keeps `max-width: 100%` so a narrow window shrinks it instead of pushing it off-screen.

- **红涨绿跌不跟着弹窗走 —— 弹窗要自己声明。** 股票页的涨跌语义是靠 `.stock-page .is-up` / `.is-down`（以及 `.amount-income` / `.amount-expense` 的反向映射）落在作用域上的，而 Modal 挂在 `body` 下，**不在** `.stock-page` 里面。弹窗里出现的盈亏数字必须在自己的类上再声明一次同向的映射（参照 `.stock-ledger__computed.is-up`：**盈 = 红（`--transactions-color-expense`），亏 = 绿（`--transactions-color-income`）**），写反了在页面上看着对、进弹窗就翻色。

### Blocking screens

- **The one blocking screen is the workspace picker** (no workspace open yet). It keeps the **whole app shell rendered behind it** — sidebar, page frame and empty states — so the user sees what they are configuring, and covers it with `--transactions-color-screen-scrim` (heavier than a modal mask, lighter than the lightbox scrim). That background layer is `inert`: no pointer, no keyboard focus, nothing in the accessibility tree; only the dialog is reachable. The screen has no dismiss affordance at all — no ×, no cancel, clicking the backdrop does nothing, and the shell refuses the window close request — the user must pick a directory (escape hatch: the tray menu's quit item). Everything else in the copy goes into the ⓘ tooltip: the title and one sentence are the whole text.

### Quit screen

- **退出是一次有交代的收尾，不是窗口突然消失。** 点关闭（关闭行为 = 直接退出）后，整屏用 `backdrop-filter: blur(10px)` 虚化已经画好的应用，中间一张 420px 宽的纸面小卡：**18px 600** 的「正在退出」（弹层标题那一档，不是正文 14px —— 这一屏只看得到半秒，标题得在余光里也认得出来）、一条 12px 的**斜纹横条**、一行 13px 的当前步骤。没有按钮，也不给关闭入口 —— 这一层最多存在半秒。
- **横条是「还在忙」，不是进度。** 退出真正要干的只有两件毫秒级的事（补写窗口位置、关工作空间），报一个百分比等于装精确，所以这里不报数：45° 的斜纹由主色与主色 28% 的浅底交替铺满，图案按 16px 的砖平铺。条纹是条上的**独立一层**，只动 `transform` 平移一格（700ms 一个周期，与下一格无缝接上）—— 动 `background-position` 每帧都要重画整条，动 `transform` 走合成层，也才落进 Motion 那条「只动 transform / opacity / color / shadow」的预算里。横条对读屏是 `aria-hidden`，它只负责"没卡住"。
- **有效信息是那句步骤文字**：13px、`text-secondary`（≈5.8:1，比三级灰 4.8:1 再提一档），半秒里也读得清。它不挂 `aria-live` —— 两次换字之间只隔 90ms，读屏念不完；这一层是 `alertdialog`，焦点进入时已经报过「正在退出」，所以遮罩挂载时把焦点收进这一层（它没有可操作的东西，因此不画焦点环）。
- **顺序是「先画面、再干活、后关窗」**：主进程发 `app:quit-started`，渲染层画完回执 `app_quit_ready`，主进程才开始补写窗口位置、关工作空间（WAL 合并），最后 `app.quit()`。回执等不到就 300ms 后继续，托盘退出（窗口不可见）直接跳过整段等待 —— 收尾不能因为界面没响应而卡住。
- **步骤文字跟着真实步骤走**：保存窗口状态 → 关闭工作空间，步骤之间留 90ms。收尾本身是毫秒级的，不留这口气斜纹条还没动起来窗口就没了；总可见时间保底 520ms。最后不再补一句「正在退出」—— 标题已经说了，重复只会多闪一次。

### Help tooltips

- **Trigger:** a 12px `Icon::InfoCircle` placed immediately after the label it explains — `--transactions-color-text-tertiary`, `cursor: help`, the same glyph the settings panels use for their fee notes. It is focusable, so the component's own `:focus-within` rule shows the bubble to keyboard users too; give it the standard 2px focus ring.
- **Bubble:** the `Tooltip` component's CSS bubble, holding one sentence in the reader's own words. The wording lives next to the vocabulary it explains, not in the page, so a renamed label and its explanation move together. No formulas here — the number's own sub-line carries the arithmetic.
- **Width:** cap it from the trigger's own class (180–320px) whenever the trigger sits inside a grid, table or panel: `overflow: hidden` ancestors clip an over-wide bubble mid-sentence, and a truncated definition reads as a wrong one.

### Segmented / Switch

- **Style:** Soft Gray track; selected segment lifts to Paper with shadow-sm and Clarity Blue text; switch is a full-radius pill, Clarity Blue when on.

## Do's and Don'ts

### Do:

- **Do** use the `--transactions-*` tokens for every color, size, and spacing value; never introduce one-off hex values.
- **Do** set every monetary amount in JetBrains Mono with tabular-nums and tight tracking.
- **Do** confine income/expense/transfer/outlier colors to transaction and stock data.
- **Do** layer surfaces with tone and 1px hairlines before reaching for shadows.
- **Do** add a 2px Clarity Blue focus ring to every interactive element.
- **Do** use the shared `ScrollArea` wrapper（`src/components/scroll-area.tsx`）for scrollable regions; it renders the overlay scrollbar through OverlayScrollbars and does not reserve layout width.
- **Do** honor `prefers-reduced-motion`（全局兜底在 `base.css`）。

### Don't:

- **Don't** hand-write `::-webkit-scrollbar` / `scrollbar-width`（它们会让 Blink 退回"占宽度"那条老路，`fixtures/static-guards.ps1` 盯着）；统一走 `ScrollArea`。也别用 OS-native window chrome（the frameless window keeps its custom title bar）。
- **Don't** paint chrome or navigation with income/expense/transfer/outlier colors.
- **Don't** add a second accent color.
- **Don't** use shadows to create hierarchy where a hairline and a tone will do.
