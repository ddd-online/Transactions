# AGENTS.md

Transactions：桌面个人记账应用，每个工作空间是一个独立的 SQLite 数据库。
**当前栈：Electron 44 + React 19 + TypeScript**（由 Tauri/Rust/Leptos 全量重写而来，见
`docs/adr/0003-electron-shell.md`）。旧版源码在 `D:\github\Transactions-Rust`（0.20.0，只读参照）。

本文件只写“去哪里看”与“为什么”。机器能判定的约定落进 `scripts/`、单测与 E2E。

## 架构

| 目录 | 职责 |
|---|---|
| `electron/` | 主进程：窗口 / 托盘 / 单实例 / `app://` / `trasset://` / 配置 / 日志 / DB / 服务 / IPC / 更新 / 旧数据导入 |
| `src/` | 渲染进程：React 19 + Vite；样式与类名从旧仓库原样复用（`src/styles`） |
| `shared/domain/` | 主/渲染共用的纯算法（money / fee / fund / stock / format / proxy / consts），无 I/O、无 Electron 依赖 |
| `shared/` | 主/渲染共用：命令目录（zod）、事件名、错误信封、配置与 DTO 类型 |
| `tests/unit` | Vitest：领域、数据、纯逻辑、导入映射 |
| `tests/e2e` | Playwright：真实 Electron、临时 `USERPROFILE`、落库/落盘断言 |
| `fixtures/` | 合成数据（旧库说明、HEIC 测试图）；真实数据绝不入库 |
| `docs/adr/` | 架构决策；0001/0002 是旧 Rust 项目的 ADR，仅作参照 |

规则：

- 渲染进程**无 Node**：`sandbox: true` + `contextIsolation: true` + 只暴露 `window.api`
  （`invoke` / `onEvent`）。文件、数据库、网络只在主进程。
- IPC 命令名、请求字段、事件名、错误 `{code,msg,status}` 是硬契约；命令目录只在
  `shared/commands.ts`，事件名只在 `shared/events.ts`，两边都不写字符串字面量。
- 所有请求在 main 边界过 zod；路径参数只收相对路径并由 `electron/shell/asset-path.ts` 校验。
- 配置是用户数据：`~/.tr.json`（dev 为 `~/.tr-dev.json`），保留未知键。
- 金额恒整数分，股价恒整数厘；日期 `YYYY-MM-DD`，时间戳 Unix 秒。

## 常用命令

```powershell
pnpm dev              # electron-vite dev（渲染层 HMR）
pnpm build            # output/out/main + output/out/preload + output/out/renderer
pnpm typecheck        # tsc --noEmit
pnpm test:unit        # Vitest
pnpm test:e2e         # 先 build 再 Playwright（真实 Electron）
pnpm package:dir      # output/win-unpacked/Transactions.exe（E2E 可用）
pnpm package         # NSIS + portable，产物在 output/
```

`pnpm test:e2e:packaged` 需要先 `pnpm package:dir`，并设置 `TRANSACTIONS_PACKAGED_EXE` 指向
`output/win-unpacked/Transactions.exe`。

## 本机环境的硬事实

- **`ELECTRON_RUN_AS_NODE=1` 可能被全局设置**：Electron 会退化成 Node 直接退出。
  `pnpm dev` 走 `scripts/electron-env.mjs` 清掉；Playwright 在 `tests/e2e` 的 env 里清掉。
- Electron 二进制与 electron-builder 的下载需要代理：
  `HTTPS_PROXY=http://127.0.0.1:7890` + `ELECTRON_GET_USE_PROXY=1` + `GLOBAL_AGENT_HTTPS_PROXY`。
- 端口：开发服务沿用 `16000`（在 Windows 保留端口段外）；生产不监听端口，只有 `app://` /
  `trasset://` 两个自定义协议。
- 别的目录可能有同名 `Transactions.exe`：按完整路径认本仓库实例。

## 验证纪律

- 能机器判定的别靠人读：`typecheck` / `test:unit` / `test:e2e` / 静态护栏。
- E2E 一律用一次性 `USERPROFILE`、`TRANSACTIONS_USER_DATA` 与临时工作空间；断言落在库/磁盘。
- 测试缝（仅测试环境变量）：`TRANSACTIONS_TEST_DIALOG_DIR` 绕过原生目录框；
  `TRANSACTIONS_TEST_CLOSE` 固定关闭行为；`TRANSACTIONS_USER_DATA` 隔离单实例锁。
  生产构建不设置这些变量。
- 旧版 26 个 PowerShell 护栏的判据要逐条迁移成 Vitest/Playwright，不许“先缺后补”。

## 迁移参照

- 旧仓库：`D:\github\Transactions-Rust`，commit `77071cb`（0.20.0）。
- `docs/migration/oracle.md`：旧 fixtures 的生成方式与用途。
- `docs/adr/0003`–`0006`：Electron 外壳、`node:sqlite`、IPC/协议、schema v1 的决策。
- 旧版的行为契约（费用/资金链/盈亏率/日期口径）以旧 Rust 源码与单测为准；重写不是重新设计业务。

