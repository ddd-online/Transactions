# AGENTS.md

Transactions is a desktop personal finance app (Electron + Vue 3 + Go/Gin). Each workspace is an independent SQLite database. Go module: `github.com/billadm`.

## Architecture

```
kernel/          # Go backend (api → service → dao → models, strict layer separation)
app/             # Vue 3 + TypeScript (Ant Design Vue, ECharts, Pinia)
electron/        # Electron main process + preload bridge
build/           # PowerShell build scripts (clean.ps1 → build.ps1 → release.ps1)
```

## OpenWolf Protocol

> See also: `.wolf/OPENWOLF.md` and `opencode.json` instructions.

- Check `.wolf/anatomy.md` before reading files, `.wolf/cerebrum.md` before generating code
- After file changes: update `.wolf/anatomy.md` and append to `.wolf/memory.md`
- Log bugs to `.wolf/buglog.json`; check it before fixing anything
- If you edit a file more than twice, that's a bug — log it

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

- **CGO_ENABLED=1** is required for Go build (SQLite)
- **Money is always integer cents** — `centsToYuan(cents)` for display, `yuanToCents(str)` for input
- **Transaction update = delete + create** — no PATCH endpoint for transactions
- **Components are auto-imported** — `unplugin-vue-components` scans `src/components/`, no manual imports needed for Ant Design Vue or custom components
- **`electronAPI`** only exists inside Electron — the frontend API client falls back to `http://127.0.0.1:28080` in browser dev mode
- **Vite base is `/static`**, not `/`
- **Go backend has no hot reload** — restart `go run main.go` after changes
- **`__BUILD_TIME__`** is a Vite-injected compile-time global, available in frontend code
- **Version is defined only in `electron/package.json`**
- **HEIC images**: use `heic-to` (libheif 1.22.2+), never `heic2any` (too old)
- **Vite `optimizeDeps.include`** must include `heic-to`; never use `optimizeDeps.exclude` for UMD modules
- **Scrollbar**: always `@include custom-scrollbar` from `_mixins.scss` — 5px warm stone thumb, never browser default or manual `::-webkit-scrollbar`. For Ant Design internals, use `:deep()` to pierce.

## Release

See `.opencode/skills/release/SKILL.md` — invoke with `/release`.
