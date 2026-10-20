# fixtures/legacy

旧版（0.20.0，Tauri + Rust）工作空间结构的说明与导入测试基线。

- `fresh.sql`：旧版**空库**的原始 DDL（从旧仓库 `fixtures/schema/fresh.sql` 原样拷贝）。
  它是导入器的**源格式**说明，不是新库的 schema 基线。新库 schema 见
  `electron/db/schema/0001_init.sql` 与 ADR 0006。
- `seed.sql` / `seed.dump.json`（M1 生成）：用旧仓库 `cargo xtask seed` 生成的确定性
  合成工作空间 dump，用于导入器的行数/金额合计校验。生成命令见
  `docs/migration/oracle.md`。

真实个人数据绝不进入本目录。
