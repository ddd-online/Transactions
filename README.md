# Transactions

Windows 桌面个人记账应用。当前处于 **Electron + TypeScript 重写期**（M0 完成），
旧版（Tauri 2 + Rust + Leptos/WASM，0.20.0）在
[Transactions-Rust](https://github.com/ddd-online/Transactions-Rust) 继续可用。

## 目标形态

- Electron 44 + React 19 + TypeScript + Vite（electron-vite）
- 数据库：Node 内置 `node:sqlite`（WAL，金额恒为整数分，股价恒为整数厘）
- 无原生模块、无本地端口；渲染进程 `sandbox` + `contextIsolation`，只经 preload 的
  `window.api` 访问主进程
- 旧数据通过一次性导入器迁移（只读旧库，不修改源目录）

## 开发

```powershell
pnpm install
pnpm dev            # Vite + Electron（渲染层 HMR）
pnpm typecheck
pnpm test:unit      # Vitest
pnpm test:e2e       # 先 build，再 Playwright 启动 Electron
pnpm dist:dir       # 未打包产物：dist/win-unpacked/Transactions.exe
pnpm dist           # NSIS 安装包 + 便携版到 dist/
```

本机注意：如果环境里带着 `ELECTRON_RUN_AS_NODE=1`，Electron 会退化成 Node 直接退出。
`pnpm dev` 走 `scripts/electron-env.mjs` 会自动清掉；Playwright 侧在 `tests/e2e` 里同样清了。

## 目录

| 路径 | 职责 |
|---|---|
| `electron/` | 主进程：窗口/托盘/协议/配置/日志/数据库/服务/IPC/更新/导入 |
| `src/` | 渲染进程：React 页面与组件；样式从旧仓库原样复用 |
| `shared/` | 主进程与渲染进程共用的命令目录、事件名、错误信封、类型 |
| `tests/unit` | Vitest（领域/数据/纯逻辑） |
| `tests/e2e` | Playwright（真实 Electron + 落库断言） |
| `fixtures/` | 合成数据：旧库说明、HEIC 测试图；不含真实个人数据 |
| `docs/` | ADR 与迁移参照（旧仓库 commit、fixtures 生成方式） |

## 迁移状态

- **M0（已完成）**：仓库脚手架、无边框窗口/托盘/单实例、`app://` 与 `trasset://`、`node:sqlite`、
  config/logging、IPC + zod、Vitest + Playwright、打包冒烟。
- **M1（进行中）**：
  - 完整 schema v1 + 迁移执行器（单事务、`VACUUM INTO` 备份、版本拒绝）；
  - 领域纯逻辑已移植：money / fee / fund / stock / format / proxy / consts / statistics /
    update 状态机；tr-draw 全部模块（chart / calendar / diary_tree / paging / list_order / crop /
    quadrant / text / section / change / query / stock_rows / stock_stats；旧 Rust 单测逐条对等，379 条 Vitest）；
  - 旧数据导入器：只读快照 → 新建工作空间 → 表级单位映射 → 金额合计校验 → 资产复制 → 报告；
    已用 `fixtures/legacy/seed.sql` 做端到端测试；
  - 纵向切片：账本 DAO/服务/5 条 IPC 命令 + React 面板 + Playwright 端到端；分类/标签
    DAO/服务 + 12 条命令（默认 19 分类 / 57 标签、排序、级联、计数）；
  - 交易记录 DAO/服务 + 9 条命令：条件筛选（类型/分类/标签/时间）、排序分页、同源统计、
    图表分桶补零、关联事件；15 + 9 条测试。
  - 图表 DAO/服务 + 5 条命令：预设 / CRUD / 拖拽排序 / chart_lines JSON；16 条测试。
  - 事件 DAO/服务 + 8 条命令：标题按字符截断、图片落盘/回滚/删除、资产路径校验；5 + 4 条测试。
  - 日记 DAO/服务 + 7 条命令：按账本隔离、字数、导入导出（UTF-8/UTF-16/GBK）。
  - 记账 · 记录页：列表 / 记一笔 / 筛选 / 分页 / 删除，Playwright 断言落库与标签。
  - 待办：其余 DAO 与服务、真实外壳与页面、导入 UI。
- 详见 `docs/adr/` 与 `docs/migration/oracle.md`。

真实数据不进入仓库；测试使用合成工作空间（`fixtures/legacy` + 临时目录）。












