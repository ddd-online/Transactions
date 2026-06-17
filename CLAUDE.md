# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Transactions is a desktop personal finance application built with Electron + Vue 3 + Go (Gin). It manages transaction records across multiple ledgers with categories, tags, key events, and data analysis charts. Each workspace is an independent SQLite database.

## Architecture

```
kernel/          # Go backend (Gin HTTP server)
  api/           # HTTP handlers — parse requests → call services → return JSON
  service/       # Business logic layer
  dao/           # Database CRUD via GORM, no business logic
  models/        # Domain models and DTOs
  workspace/     # Workspace lifecycle — one SQLite DB per workspace
  pkg/operator/  # In-memory query builder: filter → sort → page → summary
  server/        # Gin engine setup (CORS, static file serving)
  util/          # Config, DB connection, logging, UUID, file helpers
  constant/      # Shared constants (transaction types, DB name)

app/             # Vue 3 + TypeScript frontend
  src/
    backend/     # Axios API client + per-domain API modules
    components/  # Vue components organized by view
    stores/      # Pinia stores (ledger, theme, keyEvent, trQueryCondition, appData)
    router/      # Vue Router (memory history for Electron)
    types/       # TypeScript type declarations
    styles/      # SCSS with CSS custom properties (light/dark theme)

electron/        # Electron main process
  src/
    main.js      # Window management, IPC handlers, kernel lifecycle
    preload.js   # Context bridge — exposes electronAPI to renderer
    init.html    # First-run workspace selection page
```

### Go Backend Layers (strict separation)

| Layer | Responsibility |
|-------|---------------|
| `api` | Parse HTTP requests, validate input, call services, write `models.Result` JSON |
| `service` | Business logic, cross-dao operations, logging via `logger.Logger` interface |
| `dao` | Pure database CRUD with GORM, receives `*workspace.Workspace` for DB access |
| `workspace` | Database lifecycle, transaction support via `Workspace.Transaction(fn)` |

### Transaction Query Pipeline (`pkg/operator`)

Querying transactions follows a pipeline pattern (no raw SQL for filtering):

1. **DAO** retrieves all records for a ledger within a time range
2. **Filter** — `TrOperator.Filter(items)` applies in-memory AND/OR conditions. Multiple `QueryConditionItem` are OR'd; fields within an item are AND'd
3. **Sort** — `TrOperator.Sort(fields)` sorts by specified fields
4. **Page** — `TrOperator.Page(offset, limit)` slices results
5. **Summary** — `TrOperator.Summary()` returns items + total count + statistics by transaction type

## Database Schema

Each workspace is a SQLite file (`billadm.db`) with GORM auto-migration:

| Table | Purpose |
|-------|---------|
| `tbl_billadm_ledger` | Ledgers (accounts) |
| `tbl_billadm_transaction_record` | Transactions: expense/income/transfer, with price in cents |
| `tbl_billadm_transaction_record_tag` | Many-to-many: transactions ↔ tags |
| `tbl_billadm_category` | Categories organized by transaction type |
| `tbl_billadm_tag` | Tags organized by category |
| `tbl_billadm_transaction_template` | Reusable transaction templates |
| `tbl_billadm_key_event` | Key events (life milestones linked to dates) |
| `tbl_billadm_key_event_image` | Images attached to key events |
| `tbl_billadm_chart` | Saved chart configurations |

## API Reference

Base URL: `http://127.0.0.1:{port}`. Response envelope: `{"code": 0, "msg": "", "data": ...}`. Non-zero code = error.

All endpoints under `/api/v1`:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/app/exit` | Graceful shutdown |
| GET/POST | `/ledgers`, `/ledgers/:id` | Ledger CRUD |
| PATCH | `/ledgers/:id` | Update ledger |
| DELETE | `/ledgers/:id` | Delete ledger |
| POST | `/transactions/query` | Complex query with filters, sort, pagination |
| POST | `/transactions/query-chart-data` | Chart-optimized query |
| POST | `/transactions/batch` | Batch create transactions |
| POST | `/transactions` | Create single transaction |
| DELETE | `/transactions/:id` | Delete transaction |
| POST | `/transactions/link` | Link transaction to key event |
| POST | `/transactions/unlink` | Unlink transaction from key event |
| GET | `/transactions/linked/:date` | List transactions linked to a key event |
| POST/GET | `/templates` | Template CRUD |
| DELETE | `/templates/:id` | Delete template |
| PATCH | `/templates/:id/sort` | Update template sort order |
| GET/POST | `/categories` | Category CRUD |
| DELETE/PATCH | `/categories/:name` | Delete/update category |
| GET/POST | `/tags` | Tag CRUD |
| DELETE/PATCH | `/tags/:name` | Delete/update tag |
| POST | `/workspace` | Open workspace directory |
| POST/GET | `/charts` | Chart CRUD |
| DELETE | `/charts/:id` | Delete chart |
| PATCH | `/charts` | Update chart |
| GET | `/key-events/year/:year` | List key events by year |
| GET | `/key-events/dates/:year` | List dates with key events |
| GET/POST | `/key-events/:date` | Get/upsert key event |
| DELETE | `/key-events/:date` | Delete key event |
| GET/POST | `/key-events/:date/images` | List/add key event images |
| DELETE | `/key-event-images/:id` | Delete key event image |

## Key Commands

**Backend (Go kernel):**
```bash
cd kernel && go build -ldflags '-s -w -extldflags "-static"' -o Billadm-Kernel.exe
# Requires CGO_ENABLED=1 for SQLite. Runs on 127.0.0.1:28080 (dev) or 127.0.0.1:31943 (release)
```

**Frontend (Vue dev server):**
```bash
cd app && npm run dev          # Vite dev server on port 31945
cd app && npm run build        # Type-check + production build to dist/
```

**Electron:**
```bash
cd electron && npm start       # Launches Electron window
cd electron && npm run package # Package with electron-builder
```

**Run tests:**
```bash
cd kernel && go test ./...                    # All tests
cd kernel && go test -race ./...              # With race detection
cd kernel && go test -cover ./...             # With coverage
```

**Full production build (Windows):**
```powershell
./build/build.ps1   # Builds Vue → Go → Electron, outputs installer
```

## Development (Hot Reload)

Three processes run simultaneously:
1. **Go backend**: Run `kernel/main.go` in IDE, or `go run .` in `kernel/`
2. **Vue dev server**: `npm run dev` in `app/` (port 31945, proxies to backend)
3. **Electron**: `npm start` in `electron/`

In dev mode (`--mode debug`), the kernel listens on port 28080. The Vue dev server runs on 31945. Electron in dev mode points to `http://localhost:31945/static` for the renderer and `http://127.0.0.1:28080` for the API.

## Configuration

Kernel flags (see `kernel/util/config.go`):
- `--port` — listen port (default: 28080 dev, 31943 release)
- `--mode` — `debug` or `release` (Gin mode)
- `--log-level` — `debug`, `info`, `warn`, `error`
- `--workspace` — workspace directory path

Electron persists window bounds and workspace path to `~/.transactions.json`.

## Frontend Architecture

**Routing** (memory history, 5 views):
- `/ledger_view` — 账本管理 (Ledger management)
- `/tr_view` — 消费记录 (Transaction records, default route)
- `/da_view` — 数据分析 (Data analysis with charts)
- `/key_event_view` — 关键事件 (Key events calendar + detail)
- `/settings_view` — 应用设置 (Settings: categories/tags, workspace, templates, about)

**Stores** (Pinia):
- `ledgerStore` — current ledger selection and ledger list
- `trQueryConditionStore` — transaction filter/sort/page state
- `keyEventStore` — key event data cache
- `appDataStore` — application-level data (categories, tags, templates)

**Theming**: CSS custom properties defined in `app/src/styles/`. Components reference `var(--billadm-*)` variables.

**Component auto-registration**: `unplugin-vue-components` scans `src/components/` and generates `src/types/components.d.ts`. Ant Design Vue components are also auto-imported.

## Electron IPC

The preload script exposes `window.electronAPI` with:
- `minimizeWindow()`, `maximizeWindow()`, `closeWindow()` — window controls (frameless window)
- `openDialog(options)` — native open-directory dialog
- `setWorkspace(dir)`, `getWorkspace()` — workspace path persistence
- `getAppInfo(field)` — app name/version from package.json
- `getApiServer()` — returns the API base URL

Main process handles: kernel lifecycle (spawn/kill `Billadm-Kernel.exe`), first-run workspace selection via `init.html`, window state persistence.
