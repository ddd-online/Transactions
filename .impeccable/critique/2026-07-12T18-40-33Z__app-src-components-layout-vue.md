---
target: app/src/components/Layout.vue
total_score: 26
p0_count: 1
p1_count: 2
timestamp: 2026-07-12T18-40-33Z
slug: app-src-components-layout-vue
---
## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No loading indicators or workspace identity at shell level |
| 2 | Match System / Real World | 3 | Ledger metaphor well-executed, AI/diary dilute mental model |
| 3 | User Control and Freedom | 3 | Workspace error has retry path, no breadcrumbs or undo |
| 4 | Consistency and Standards | 3 | Token system consistent, dead CSS classes in _layout.scss |
| 5 | Error Prevention | 3 | Delete confirmation exists, no unsaved-change guarding |
| 6 | Recognition Rather Than Recall | 4 | Icon+label dual annotation, multi-feature active state |
| 7 | Flexibility and Efficiency | 2 | No keyboard shortcuts, no global search, no collapsible sidebar |
| 8 | Aesthetic and Minimalist Design | 4 | Warm ivory + sage green, zero decorative noise |
| 9 | Error Recovery | 2 | Workspace failure has retry, no shell-level error boundary |
| 10 | Help and Documentation | 0 | No help button, tooltip, or onboarding hint anywhere in shell |
| **Total** | | **26/40** | **Acceptable** |

## Anti-Patterns Verdict

**LLM assessment:** Clean on all bans — no glassmorphism, gradient text, side-stripe borders, hero-metric templates, eyebrow text, numbered sections, or identical card grids. Warm ivory palette (#F7F4EF) could be misread as SaaS-cream but is earned: 3-tier hierarchy, sage green accent instead of generic blue/purple, backed by a full token system. One mild signal: index.scss:46-58 atmospheric radial gradients (2-3% opacity) are a known AI pattern but restrained here.

**Detector scan:** 5 advisory findings all in AppLeftBar.vue — 4 font-size deviations (16px, 10px, 16px, 18px not in DESIGN.md type ramp) and 1 radius deviation (2px not in rounded scale). All are intentional UI values, not design drift. No critical/accessibility findings.

## Priority Issues

**1. [P0] No keyboard accessibility in navigation.** AppLeftBar.vue:43-53 uses <button> elements but lacks focus-visible styling, Escape-to-close on ledger dropdown, and keyboard shortcuts. Fix: Add focus-visible ring matching index.scss:223-226, Escape on dropdown, Ctrl+1~Ctrl+6 for nav items.

**2. [P1] Settings button uses disabled text color.** AppLeftBar.vue:343-345 sets nav-btn-secondary text to --billadm-color-text-disabled (#9E9E96). A clickable target must never use disabled semantic color. Fix: Use --billadm-color-text-secondary (#5C5C55).

**3. [P1] Dead CSS classes in _layout.scss.** .menu-bar (lines 97-127), .icon-nav (lines 133-152), .layout-sider (lines 41-49) don't match current scoped-component architecture. Fix: Audit all views, migrate or delete.

**4. [P2] No workspace identity in shell.** Ledger name in dropdown (AppLeftBar.vue:8) but no persistent indicator of which database is being edited. Switching workspaces silently. Fix: Add workspace label in sidebar footer or as tooltip.

**5. [P2] Window controls lack maximize state toggle.** AppTopBar.vue:7 always renders BorderOutlined. Should toggle icon when maximized. Fix: Listen for window state IPC event and toggle icon.

## Cognitive Load

7 PASS, 1 FAIL: Progressive disclosure fails — all 6 nav items always visible regardless of context. No collapsing, sectioning, or contextual reveal. The delete button hover-opacity pattern is the only progressive disclosure example.

## Minor Observations

- AppLeftBar.vue:336-337: .nav-btn-secondary {} is empty — planned but never completed
- _layout.scss:42: .layout-sider uses !important on background-color, redundant with index.scss:77-79
- index.scss:517: .ant-message bottom: 48px is a magic number, should use --billadm-size-header-height
- AppLeftBar.vue:209: text-align: left on flex item — harmless copy-paste artifact
- page-fade transition at 180ms is correctly faster than normal (200ms) and slower than fast (150ms)

## Persona Red Flags

**Alex (Power User):** No keyboard shortcuts, 7 always-visible nav items, no command palette. High abandonment risk.

**Sam (Accessibility):** No focus-visible on nav buttons, disabled-color text on settings button misleads screen readers.

**Jordan (First-Timer):** Ledger selector always visible but with no guidance — new users face an empty dropdown.

## Questions

1. If this app is "calm and restrained," why does it need an AI assistant nav item that breaks the quiet, human-centered accounting experience?
2. The sidebar is fixed at 200px. Would a collapsible icon-only mode (the token system already defines --billadm-size-sider-width: 56px) serve precise users who want more data space?
3. What does a new user see on first launch — no workspace, no ledger, no data? The empty state shell experience isn't designed yet.
