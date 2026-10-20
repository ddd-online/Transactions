# ADR 0004：用 Node 内置 `node:sqlite` 作为数据库驱动

## 背景

旧实现用 `rusqlite`（bundled SQLite）。Electron 下常见选择是 `better-sqlite3`，但它是原生模块：
需要按 Electron ABI 重建，单测（系统 Node）与运行时（Electron）的 ABI 不一致，会让
“测试绿、应用加载失败”成为常见事故；打包也要处理 `asarUnpack`。

Electron 44 内置 Node 24，`node:sqlite` 的 `DatabaseSync` 可直接使用；系统 Node 22 也提供
（实验阶段，但 API 已稳定）。M0 已在开发构建与打包产物中验证建库、WAL、事务、查询。

## 决策

- 驱动唯一入口 `electron/db/driver.ts`：`Db` 暴露 `exec/prepare/transaction/close`，上层不感知实现。
- 使用 `node:sqlite`，不开 `readBigInts`（金额在安全整数范围内）；WAL + `busy_timeout=5000`。
- 打开既有库时只读校验；旧库（含 `tbl_billadm_schema_migration`）返回 `ERR_CODE_LEGACY_WORKSPACE`。
- 若某版 Electron 移除/改变 `node:sqlite`，或打包态验证失败：只替换 `driver.ts` 为
  `better-sqlite3`，并把单测改为在 Electron 的 Node 下运行（`ELECTRON_RUN_AS_NODE=1`）。

## 后果

- 无原生依赖、无 ABI 重建、打包最简单；单测与运行时同一驱动。
- `node:sqlite` 仍是 Node 的实验特性：升级 Electron 时必须跑打包态冒烟（`tests/e2e/packaged.spec.ts`）。
- 事务语法由 `Db.transaction` 提供（`BEGIN IMMEDIATE` / `COMMIT` / `ROLLBACK`）。
