# 迁移进度（按模块）

> 只记录“有没有对等实现 + 有没有对等测试”。旧版行为以 `D:\github\Transactions-Rust`
> （0.20.0 / commit `77071cb`）为准。更新时间：M1 / 2026-10-20。

## 领域纯逻辑（`shared/domain`）

| 旧模块 | 新模块 | 状态 |
|---|---|---|
| `tr-domain/money.rs` | `money.ts` | ✅ 8 测试 |
| `tr-domain/fee.rs` | `fee.ts` | ✅ 12 测试 |
| `tr-domain/fund.rs` | `fund.ts` | ✅ 6 测试 |
| `tr-domain/stock.rs` | `stock.ts` | ✅ 29 测试 |
| `tr-domain/format.rs` | `format.ts` | ✅ 18 测试 |
| `tr-domain/proxy.rs` | `proxy.ts` | ✅ 10 测试 |
| `tr-domain/consts.rs` | `consts.ts` | ✅ 随使用点覆盖 |
| `tr-domain/statistics.rs` | `statistics.ts` | ✅ 15 测试 |
| `tr-domain/update.rs` | `update.ts` | ✅ 22 测试 |
| `tr-draw/paging.rs` | `paging.ts` | ✅ 3 测试 |
| `tr-draw/list_order.rs` | `list-order.ts` | ✅ 5 测试 |
| `tr-draw/crop.rs` | `crop.ts` | ✅ 4 测试 |
| `tr-draw/quadrant.rs` | `quadrant.ts` | ✅ 9 测试 |
| `tr-draw/text.rs` | `text.ts` | ✅ 5 测试 |
| `tr-draw/section.rs` | `section.ts` | ✅ 7 测试 |
| `tr-draw/change.rs` | `change.ts` | ✅ 4 测试 |
| `tr-draw/calendar.rs` | `calendar.ts` | ✅ 14 测试 |
| `tr-draw/diary_tree.rs` | `diary-tree.ts` | ✅ 4 测试 |
| `tr-draw/chart.rs` | `chart.ts` | ✅ 23 测试 |
| `tr-draw/query.rs` | `query.ts` | ✅ 10 测试 |
| `tr-draw/stock_rows.rs` | `stock-rows.ts` | ✅ 8 测试 |
| `tr-draw/stock_stats.rs` | `stock-stats.ts` | ✅ 11 测试 |
| `tr-ui/time.rs` | `time.ts` | ✅ 5 测试 |

## 数据层

| 模块 | 状态 |
|---|---|
| `schema/0001_init.sql`（25 表 + 索引，单位后缀） | ✅ |
| 迁移执行器（连续版本 / 事务 / `VACUUM INTO` 备份 / 版本拒绝） | ✅ 7 测试 |
| 旧库探测 + 一次性导入（快照 / 单位映射 / 合计校验 / 资产 / 报告） | ✅ 8 测试 |
| `dao/ledger.ts` + 级联清单 | ✅ 4 测试（含“带 ledger_id 的表都被级联覆盖”守卫） |
| `dao/category.ts` / `dao/tag.ts`（默认 19 分类 / 57 标签、排序、级联、计数） | ✅ 22 测试 |
| 其余 DAO（transaction/chart/key_event/diary/stock/todo） | ⬜ 待移植 |
| 旧 fixtures（`seed.sql` / `seed.dump.json` / `fresh.sql` / HEIC） | ✅ |

## 服务与 IPC

| 模块 | 状态 |
|---|---|
| `services/ledger.ts` + 5 条 ledger 命令 | ✅ 单元 + Playwright 端到端（新建/列表/落库/删除） |
| `services/category.ts` / `services/tag.ts` + 12 条命令 | ✅ 单元测试 |
| 其余业务命令（约 112 条） | ⬜ 待移植 |
| config / workspace / 导入命令 | ✅（M0/M1） |
| 更新命令 + 下载器 | ⬜ 待移植 |

## 界面

| 模块 | 状态 |
|---|---|
| M0 外壳（窗口/托盘/协议/IPC）+ 账本面板 | ✅ |
| 设计系统 35 个组件 | ⬜ |
| 记账 5 子功能 / 股票 / 事件 / 日记 / 待办 / 设置 | ⬜ |

## 测试与护栏

| 项 | 状态 |
|---|---|
| Vitest 311 条（领域 + 数据 + 导入 + 账本 + 分类标签） | ✅ |
| Playwright M0 冒烟 + 账本端到端 | ✅ |
| 打包产物冒烟（`TRANSACTIONS_PACKAGED_EXE`） | ✅ |
| 静态护栏 8 项（安全/协议/端口/事件/版本/旧栈残留） | ✅ |
| 旧 26 个 UIA 护栏对等迁移 | ⬜ |




