# AGENTS.md

Transactions is a desktop personal finance app (Electron + Vue 3 + Go/Gin). Each workspace is an independent SQLite database. Go module: `github.com/billadm`; product name: "Transactions"; CSS vars: `--billadm-`.

See also: `PRODUCT.md` (product context), `DESIGN.md` (design system + do's/don'ts).

## Architecture

```
kernel/          # Go backend (api → service → dao → models, strict layer separation)
app/             # Vue 3 + TypeScript (Ant Design Vue, ECharts, Pinia, dayjs)
electron/        # Electron main process + preload bridge (CJS)
build/           # PowerShell build scripts (clean.ps1 → build.ps1 → release.ps1)
```

## Key Commands

**Dev (one command — Go has no hot reload):**
```bash
npm run dev                       # Starts kernel (:28080) + Vite (:31945) + Electron concurrently
```
Or individually if needed:
```bash
cd kernel && go run main.go       # API server on :28080
cd app && npm run dev             # Vite HMR on :31945, base=/static
cd electron && npm run dev        # Electron window
```

**Verify:**
```bash
cd kernel && go test ./...        # All tests
cd kernel && go vet ./...         # Static analysis
cd app && npx vue-tsc -b          # Type-check only (project references, no emit)
```

**Build (order matters, windows/amd64 only):**
```bash
./build/clean.ps1                 # Clean artifacts
./build/build.ps1                 # Vue → Go → Electron NSIS installer → build/target/
./build/release.ps1               # Publish to GitHub Release (requires gh CLI)
```

## Critical Gotchas

- **CGO is NOT required** — `github.com/glebarez/sqlite` (pure Go SQLite). Production builds use `CGO_ENABLED=0`, `go build -ldflags '-s -w'`.
- **Kernel port differs by mode**: `:28080` in dev (`go run`), `:31943` in production (launched by Electron with `-port 31943`). The frontend API client auto-detects via `electronAPI.getApiServer()`.
- **Kernel lifecycle**: In dev, kernel runs independently via `go run`. In production, Electron spawns `transactions.exe` as a child process on startup (`electron/src/main.js:82`). The child process is killed on app quit.
- **Two-window flow**: First run shows `initWindow` (workspace selection, `electron/src/init.html`). After workspace is chosen, it switches to `mainWindow`. Both are frameless.
- **System tray**: Minimize-to-tray supported. Close behavior (quit vs. tray) is configurable, persisted in `~/.transactions.json` (`~/.transactions-dev.json` in dev).
- **Money is always integer cents** — `Price int64` in Go model. Frontend converts: `centsToYuan(cents)` for display, `yuanToCents(str)` for input (`app/src/backend/functions.ts`).
- **Transaction update = delete + create** — no single-record PATCH/PUT endpoint for transactions. The frontend API (`app/src/backend/api/tr.ts`) has create, batch create, delete, link/unlink, and query operations.
- **Components are auto-imported** — `unplugin-vue-components` scans `app/src/components/`, no manual imports needed for Ant Design Vue or custom components. Generated types: `app/src/types/components.d.ts`. Vue composition APIs (`ref`, `computed`, etc.) are NOT auto-imported — always import from `vue`.
- **`electronAPI`** only exists inside Electron (`contextBridge` in preload.js) — the frontend API client (`api-client.ts`) falls back to `http://127.0.0.1:28080/api` in browser dev mode.
- **Vite base is `/static`**, not `/`. Path alias `@` → `app/src/`.
- **Go backend has no hot reload** — restart `go run main.go` after changes.
- **`__BUILD_TIME__`** is a Vite-injected compile-time global, defined in `vite.config.ts`.
- **Version is defined only in `electron/package.json`** — build and release scripts read it from there.
- **HEIC images**: use `heic-to` (libheif 1.22.2+), never `heic2any` (too old).
- **Vite `optimizeDeps.include`** must include `heic-to`; never use `optimizeDeps.exclude` for UMD modules.
- **Scrollbar**: always `@include custom-scrollbar` from `_mixins.scss` — 5px warm stone thumb, never browser default or manual `::-webkit-scrollbar`. For Ant Design internals, use `:deep()` to pierce.
- **Electron frame: false** — custom title bar via `window-control` IPC, not OS native chrome. Drag regions via `@include drag-region` mixin.
- **No frontend tests** — vitest is in dependencies but no test files exist.
- **Design system is enforced by DESIGN.md** — only light mode, one accent color (`#4A8E70`), semantic colors never leak outside transaction data. Read `DESIGN.md` before any UI work.
- **CSS variables use `--billadm-` prefix** — defined in SCSS, mapped from DESIGN.md tokens.
- **API response envelope**: `{ code: number, msg: string, data: T }`. `code === 0` means success (default in `models.NewResult()`). Frontend `api.post/get/put/patch/delete` helpers throw on `code !== 0`.
- **Error handling in frontend**: use `withErrorHandling(fn, { errorPrefix, fallback })` for queries, or `{ errorPrefix, rethrow: true }` for mutations. Prefer `tryOrFallback` for non-critical data.
- **`api-client.ts` auto-detects workspace errors**: when backend returns `msg: "未打开工作空间"`, it dispatches `window.dispatchEvent(new CustomEvent('workspace-required'))` — the Layout component listens for this and triggers workspace re-open flow.
- **Pinia stores**: use `storeToRefs()` when destructuring reactive state. Never destructure store directly.
- **Vue Router uses `createMemoryHistory()`** — not browser history (Electron has no URL bar).
- **Go API handlers**: all new endpoints are wrapped through `api.Handle()` which creates the `Result` envelope. Handler functions return `(any, error)`. Middleware `RequireWorkspace` injects the opened workspace into the gin context.
- **Single instance lock**: Electron's `app.requestSingleInstanceLock()` ensures only one app instance.
- **Auto-migration on workspace open**: GORM `AutoMigrate` is called when a workspace opens (`kernel/util/database.go`). Adding a model field requires no migration scripts.
- **Go import paths** all use `github.com/billadm/...` prefix — the compose root is `kernel/server/wire.go`.

## Release

See `.opencode/skills/release/SKILL.md` — invoke with `/release`.
