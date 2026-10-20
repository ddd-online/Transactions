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
| `dao/transaction-record.ts` + `transaction-record-tag.ts`（过滤/排序/分页/统计/图表分桶） | ✅ 15 测试 |
| `dao/chart.ts` + `services/chart.ts`（预设 / CRUD / 排序 / chart_lines JSON） | ✅ 16 测试 |
| `dao/diary.ts` + `services/diary.ts`（按账本隔离 / 字数 / 导入导出编码） | ✅ 15 测试 |
| `dao/key-event.ts` / `key-event-image.ts` + 服务（标题按字符截断、图片落盘/回滚/清理） | ✅ 5 测试 |
| `services/assets.ts`（图片/图标落盘、data URI 校验、路径穿越） | ✅ 4 测试 |
| `dao/todo.ts` + `services/todo.ts`（卡片/事项/进度、六档吸附、完成态） | ✅ 10 测试 |
| `dao/stock-settings.ts` / `stock-fund.ts`（账户 / 费用 / 标签 / 复盘模板 / 资金链） | ✅ 23 测试 |
| `dao/stock-trade.ts`（持仓 / 成交 / 历史 / 轮次，35 个函数） | ✅ 20 测试 |
| 股票服务其余切片（持仓 / 成交写入 / 统计 / 复盘 / 归档） | ⬜ 待移植 |
| 旧 fixtures（`seed.sql` / `seed.dump.json` / `fresh.sql` / HEIC） | ✅ |

## 服务与 IPC

| 模块 | 状态 |
|---|---|
| `services/ledger.ts` + 5 条 ledger 命令 | ✅ 单元 + Playwright 端到端（新建/列表/落库/删除） |
| `services/category.ts` / `services/tag.ts` + 12 条命令 | ✅ 单元测试 |
| `services/chart.ts` + 5 条 chart 命令 | ✅ 16 测试 |
| `services/diary.ts` + 7 条 diary 命令（日期列表 / 读写 / 导入导出） | ✅ 15 测试 |
| `services/key-event.ts` + 8 条 key_event 命令（含图片上传/删除） | ✅ 5 测试 |
| `services/todo.ts` + 12 条 todo 命令 | ✅ 10 测试 |
| `services/stock-account.ts` + 13 条 stock 账户命令 | ✅ 23 测试 |
| `services/transaction-record.ts` + 9 条 tr 命令（CRUD / 条件查询 / 图表 / 关联事件） | ✅ 9 测试 |
| 其余业务命令（约 112 条） | ⬜ 待移植 |
| config / workspace / 导入命令 | ✅（M0/M1） |
| 更新命令 + 下载器 | ⬜ 待移植 |

## 界面

| 模块 | 状态 |
|---|---|
| M0 外壳（窗口/托盘/协议/IPC）+ 账本面板 | ✅ |
| 记账 · 记录页（列表 / 记一笔 / 类型+关键词筛选 / 分页 / 删除 / 合计） | ✅ Playwright |
| 记账 · 看板（月/年期间、收支卡、支出构成） | ✅ Playwright |
| 股票 · 账户与设置（本金/支取/利息、费用、资金记录） | ✅ Playwright |
| 设计系统 35 个组件 | ⬜ |
| 记账其余 4 子功能 / 股票 / 事件 / 日记 / 待办 / 设置页 | ⬜ |

## 测试与护栏

| 项 | 状态 |
|---|---|
| Vitest 441 条（领域 + 数据 + 导入 + 账本 + 分类 + 交易 + 图表 + 日记 + 事件 + 待办 + 看板 + 股票账户） | ✅ |
| Playwright：M0 / 账本 / 设置 / 记录 / 股票（5 条） | ✅ |
| 打包产物冒烟（`TRANSACTIONS_PACKAGED_EXE`） | ✅ |
| 静态护栏 8 项（安全/协议/端口/事件/版本/旧栈残留） | ✅ |
| 旧 26 个 UIA 护栏对等迁移 | ⬜ |















