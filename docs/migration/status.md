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
| `services/stock-positions.ts` + `stock-quote.ts`（持仓 / 总览 / 行情 GBK） | ✅ 27 测试 |
| `services/stock-history.ts` / `stock-statistics.ts`（历史回填 / 详情 / 统计口径） | ✅ 39 测试 |
| `services/stock-trade-write.ts`（下单 / 多笔成交 / 费用分摊 / 轮次归档） | ✅ 17 测试 |
| `services/stock-lifecycle.ts`（重置 / 归档到新账本） | ✅ 3 测试 |
| `services/stock-trade-edit.ts`（编辑 / 删除 / 重放 / 预览 / 回滚） | ✅ 31 测试 |
| `services/stock-review.ts`（每日复盘 / 轮次复盘 / 股票名称） | ✅ 4 测试 |
| `services/stock-trades.ts`（当前轮 / 全历史成交列表） | ✅ 2 测试 |
| `dao/transaction-template.ts` + 服务（模板 CRUD / 排序） | ✅ 3 测试 |
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
| 旧版命令面 117/117 + 5 个新命令（导入/账户摘要/调试） | ✅ 122 条 |
| config / workspace / 导入命令 | ✅（M0/M1） |
| 更新命令 + 下载器 | ✅ 10 测试 |

## 界面

| 模块 | 状态 |
|---|---|
| M0 外壳（窗口/托盘/协议/IPC）+ 侧栏导航 + 账本管理 | ✅ |
| 事件页（按年日期列表 / 标题正文颜色 / 图片上传删除） | ✅ Playwright |
| 日记页（日期列表 / 心情 / 字数 / 覆盖与删除 / 目录导入导出） | ✅ Playwright |
| 待办页（主题 / 事项 / 进度打勾 / 完成进历史） | ✅ Playwright |
| 旧版导入向导（检查 / 进度 / 报告 / 自动打开新工作空间） | ✅ Playwright |
| 更新器（GitHub Releases / sha256 / 取消 / 安装）与七状态面板 | ✅ 10 测试 |
| NSIS 安装版 + 便携版 + 打包产物冒烟 | ✅ Playwright |
| 记账 · 记录页（列表 / 记一笔 / 模板套用与保存 / 标签筛选 / 异常 / 关联事件 / 分页 / 删除） | ✅ Playwright |
| 记账 · 子功能切换（看板/记录/分析/标签/模板） | ✅ Playwright |
| 记账 · 看板（月/年期间、收支卡、支出构成） | ✅ Playwright |
| 记账 · 图表页（预设曲线 / 新建删除 / 月年分桶 / SVG 折线） | ✅ Playwright |
| 记账 · 分类与标签页（新建 / 删除 / 排序） | ✅ Playwright |
| 记账 · 模板页（列表 / 删除；记录页保存套用） | ✅ Playwright |
| 股票 · 账户与设置（本金/支取/利息、费用、资金记录、每日复盘、操作回滚、重置/归档） | ✅ Playwright |
| 股票 · 交易历史 / 统计页（汇总 / 轮次详情 / 复盘与标签 / 成交编辑与删除 / 逐笔与分组） | ✅ Playwright |
| 设计系统：外壳/侧栏/导航/确认弹窗/提示/空态/标签复用旧版 CSS | ✅ |\n| 设计系统：页面内 35 个组件 | ⬜ |
| 设置页补齐（关闭行为 / 代理 / 工作空间图标 / 按账本功能开关） | ✅ Playwright |
| 设计还原 | ⬜ |

## 测试与护栏

| 项 | 状态 |
|---|---|
| Vitest 587 条（领域 + 数据 + 导入 + 账本 + 分类 + 交易 + 图表 + 日记 + 事件 + 待办 + 看板 + 股票 + 模板 + 更新器） | ✅ |
| Playwright：M0 / 账本 / 设置 / 记录 / 股票 / 事件 / 日记 / 待办 / 导入 / 导航 / 股票归档重置 / 关闭行为 / 导入拒绝 / 旧版打开拒绝 / 更新失败 / DevTools / 窗口尺寸 / 单实例 / 工作空间切换 / 图片另存（21 条）+ 打包产物 | ✅ |
| 打包产物冒烟（`TRANSACTIONS_PACKAGED_EXE`） | ✅ |
| 静态护栏 9 项（安全/协议/端口/事件/版本/旧栈/发布说明） | ✅ |
| 旧 26 个 UIA 护栏对等迁移 | 🟡 21 条 Playwright 覆盖主链路 |





















































