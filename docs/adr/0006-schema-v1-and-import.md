# ADR 0006：schema v1 与旧数据导入

## 背景

旧库有 15 条历史迁移（`tr-store/src/migrations.rs`），但新应用可以重新设计格式。业务数据
（账本 / 流水 / 股票 / 事件 / 日记 / 待办）必须一次性搬过来，且源目录只读。

## 决策

- **新库 schema v1**：表名去掉 `tbl_billadm_` 前缀；列名统一单位后缀——
  金额 `*_cents`、股价 `*_milli`、时间戳 `*_at`（Unix 秒）、日期 `*_date`（TEXT）。
  `app_meta` 记录 `schema_version`（v1 为 `1`）。
- **不移植 15 条历史迁移**：新库只有 `0001_init.sql`；之后的变更走 `migrate.ts`（单事务、
  幂等、升级前 `VACUUM INTO` 备份、同工作空间只留最近一份 `.bak`）。
- **v1 不加外键**：旧库可能有孤儿行，旧服务层用手工事务级联；先按既有语义移植，
  导入器校验并报告孤儿，数据证明干净后再加 FK 迁移。
- **导入器只接受 0.20.0 格式**：校验 `tbl_billadm_schema_migration` 的 15 个 id 齐全；
  不齐时提示“先用 0.20.0 打开一次旧工作空间完成升级”，不猜、不跑旧迁移。
- 导入流程：只读源库（SQLite `backup()` 一致性快照）→ 空目录建新库 → 逐表复制（保留 ID）→
  修正空 `ledger_id`（归最早账本）→ 复制资产 → 行数/金额合计/唯一键校验 →
  写 `import-report.json` → 失败回滚且旧库不变。
- 导入器实现：`electron/legacy/importer.ts`；`probe` 只读探测，`import` 用 `node:sqlite` 的
  `backup()` 做一致性快照；目标目录必须为空且不能嵌在源目录里；源库哈希前后核对。
- 配置仍用 `~/.tr.json`（dev `-dev`）与原有键名，保留未知键；新增 `dataVersion`。
- 旧库识别：打开既有 `transactions.db` 时若存在 `tbl_billadm_schema_migration`，
  返回 `ERR_CODE_LEGACY_WORKSPACE`（`-3`），界面据此引导导入。

## 后果

- 旧迁移引擎与 15 条迁移不进入新仓库；导入器的正确性由 `fixtures/legacy/seed.sql` 的
  dump 对比与真实副本演练保证。
- 表/列改名意味着 DAO 与 SQL 全部是新的；这是重写成本的一部分，换来的是单位后缀明确、
  不会再出现“price 有时是分、有时是厘”的歧义。
- 旧版（0.20.0）仍能打开旧库；新应用只写新库，回退不需要反向迁移。
