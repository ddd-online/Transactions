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
pnpm package:dir    # 未打包产物：output/win-unpacked/Transactions.exe
pnpm package        # NSIS 安装包 + 便携版到 output/

# 发布链路（产物断言 + 打包产物冒烟）
pwsh -File build/build.ps1 -E2E
pwsh -File build/release.ps1 -Tag v1.0.0
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
| `output/` | 构建物料：编译产物 `out/`、运行/构建日志 `logs/`、安装包与未打包目录 |

## 迁移状态

- **M0（已完成）**：仓库脚手架、无边框窗口/托盘/单实例、`app://` 与 `trasset://`、`node:sqlite`、
  config/logging、IPC + zod、Vitest + Playwright、打包冒烟。
- **M1（进行中）**：
  - 完整 schema v1 + 迁移执行器（单事务、`VACUUM INTO` 备份、版本拒绝）；
  - 领域纯逻辑已移植：money / fee / fund / stock / format / proxy / consts / statistics /
    update 状态机；tr-draw 全部模块（chart / calendar / diary_tree / paging / list_order / crop /
    quadrant / text / section / change / query / stock_rows / stock_stats；旧 Rust 单测逐条对等，588 条 Vitest）；
  - 旧数据导入器：只读快照 → 新建工作空间 → 表级单位映射 → 金额合计校验 → 资产复制 → 报告；
    已用 `fixtures/legacy/seed.sql` 做端到端测试；
  - 纵向切片：账本 DAO/服务/5 条 IPC 命令 + React 面板 + Playwright 端到端；分类/标签
    DAO/服务 + 12 条命令（默认 19 分类 / 57 标签、排序、级联、计数）；
  - 交易记录 DAO/服务 + 9 条命令：条件筛选（类型/分类/标签/时间）、排序分页、同源统计、
    图表分桶补零、关联事件；15 + 9 条测试。
  - 图表 DAO/服务 + 5 条命令：预设 / CRUD / 拖拽排序 / chart_lines JSON；16 条测试。
  - 股票账户/费用/标签/复盘模板/资金链 + 13 条命令；持仓/成交/历史/轮次 DAO（23 + 20 条测试）。
  - 命令面：旧版 117 条命令全部对齐（另加 5 条导入/调试命令）；模板与股票成交列表补齐。
  - 设置页：外观、关闭行为、系统/手动代理（行情与更新共用 session 代理）、工作空间图标、按账本功能开关。
  - 股票历史/统计页：清仓汇总、单股轮次详情与复盘/标签、逐笔/分组/最近 N/标签统计，Playwright 覆盖。
  - 更新器：GitHub latest release、sha256 校验、取消/安装、七状态面板；10 条测试。
  - 打包：NSIS 安装版 + 便携版，打包产物 Playwright 冒烟通过。
  - 旧版导入向导：探查 0.20.0 库、进度事件、报告与自动打开新工作空间，Playwright 用种子库跑通。
  - 日记导入导出：按目录扫描/导入 `YYYY-MM-DD.txt`、导出全部；Playwright 验证往返。
  - 界面壳：旧版顶栏/页头/侧栏/导航/确认弹窗/提示条复用 `base/ui/app.css`，页面内容用设计令牌。
  - 侧栏导航 + 记账/股票/事件/日记/待办/设置分页；事件图片、日记、待办页面均 Playwright 覆盖。
  - 股票复盘：每日复盘（本轮区间/500 字）、轮次复盘、股票名称查询；4 条测试。
  - 股票成交编辑/删除/全账本重放/预览/回滚；31 条测试。
  - 股票重置/归档：清空股票数据、归档到新账本并复制费用设置；3 条测试。
  - 股票下单：多笔成交、委托级佣金、逐笔税费、建/加/减/清仓、轮次归档；17 条测试。
  - 股票历史/统计读层：回填、详情、汇总、逐笔/分组/区间/标签统计；39 条测试。
  - 股票持仓/总览 + 行情抓取（腾讯 GBK、注入式 fetcher、浮动盈亏/仓位比例）；27 条测试。
  - 股票 · 账户页：本金/支取/利息、每日复盘、费用设置、资金记录、操作回滚、重置/归档、下单表单，Playwright 验证现金链与持仓落库。
  - 记账子功能：看板 / 记录 / 图表 / 分类标签 / 模板，顶部子功能切换，均 Playwright 覆盖。
  - 记账 · 图表页：预设曲线、新建/删除、按月/按年分桶与 SVG 折线，Playwright 覆盖。
  - 记账 · 看板页：月/年期间、收支卡、支出构成，Playwright 与记一笔联动。
  - 待办 DAO/服务 + 12 条命令：卡片/事项/进度、六档吸附、完成态与历史；10 条测试。
  - 事件 DAO/服务 + 8 条命令：标题按字符截断、图片落盘/回滚/删除、资产路径校验；5 + 4 条测试。
  - 日记 DAO/服务 + 7 条命令：按账本隔离、字数、导入导出（UTF-8/UTF-16/GBK）。
  - 记账 · 记录页：列表 / 记一笔 / 模板套用与保存 / 标签筛选 / 异常与关联事件 / 分页 / 删除，Playwright 断言落库与标签。
  - 待办：其余 DAO 与服务、真实外壳与页面、导入 UI。
- 详见 `docs/adr/`、`docs/migration/oracle.md` 与验收清单 `docs/migration/acceptance.md`。

真实数据不进入仓库；测试使用合成工作空间（`fixtures/legacy` + 临时目录）。















































