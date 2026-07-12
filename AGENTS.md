# AGENTS.md

Transactions is a desktop personal finance app (Electron + Vue 3 + Go/Gin). Each workspace is an independent SQLite database. Go module: `github.com/billadm`.

## Architecture

```
kernel/          # Go backend (api → service → dao → models, strict layer separation)
app/             # Vue 3 + TypeScript (Ant Design Vue, ECharts, Pinia)
electron/        # Electron main process + preload bridge
build/           # PowerShell build scripts (clean.ps1 → build.ps1 → release.ps1)
```

## Key Commands

**Dev (3 terminals simultaneously — Go has no hot reload):**
```bash
cd kernel && go run main.go      # API server on :28080
cd app && npm run dev            # Vite HMR on :31945, base=/static
cd electron && npm run dev        # Electron window
```

**Verify:**
```bash
cd kernel && go test ./...       # All tests
cd kernel && go vet ./...        # Static analysis
cd app && npx vue-tsc -b         # Type-check only
```

**Build (order matters):**
```bash
./build/clean.ps1                # Clean artifacts
./build/build.ps1                # Vue → Go → Electron NSIS installer → build/target/
./build/release.ps1              # Publish to GitHub Release (requires gh CLI)
```

## Critical Gotchas

- **CGO is NOT required** — the project uses `github.com/glebarez/sqlite` (pure Go SQLite). Production builds use `CGO_ENABLED=0`.
- **Kernel port differs by mode**: `:28080` in dev (`go run`), `:31943` in production (launched by Electron with `-port 31943`). The frontend API client auto-detects via `electronAPI.getApiServer()`.
- **Money is always integer cents** — `centsToYuan(cents)` for display, `yuanToCents(str)` for input
- **Transaction update = delete + create** — no PATCH endpoint for transactions
- **Components are auto-imported** — `unplugin-vue-components` scans `src/components/`, no manual imports needed for Ant Design Vue or custom components. Generated types: `src/types/components.d.ts`.
- **`electronAPI`** only exists inside Electron (`contextBridge` in preload.js) — the frontend API client (`api-client.ts`) falls back to `http://127.0.0.1:28080/api` in browser dev mode
- **Vite base is `/static`**, not `/`. Path alias `@` → `app/src/`.
- **Go backend has no hot reload** — restart `go run main.go` after changes
- **`__BUILD_TIME__`** is a Vite-injected compile-time global, defined in `vite.config.ts`
- **Version is defined only in `electron/package.json`** — build and release scripts read it from there
- **HEIC images**: use `heic-to` (libheif 1.22.2+), never `heic2any` (too old)
- **Vite `optimizeDeps.include`** must include `heic-to`; never use `optimizeDeps.exclude` for UMD modules
- **Scrollbar**: always `@include custom-scrollbar` from `_mixins.scss` — 5px warm stone thumb, never browser default or manual `::-webkit-scrollbar`. For Ant Design internals, use `:deep()` to pierce.
- **Electron frame: false** — custom title bar via `window-control` IPC, not OS native chrome
- **No frontend tests** — vitest is in dependencies but no test files exist

## Release

See `.opencode/skills/release/SKILL.md` — invoke with `/release`.
