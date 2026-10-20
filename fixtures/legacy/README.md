# fixtures/legacy

旧版（0.20.0，Tauri + Rust）工作空间结构的说明与导入测试基线。

- `fresh.sql`：旧版**空库**的原始 DDL（从旧仓库 `fixtures/schema/fresh.sql` 原样拷贝）。
  它是导入器的**源格式**说明，不是新库的 schema 基线。新库 schema 见
  `electron/db/schema/0001_init.sql` 与 ADR 0006。
- `seed.sql`：`cargo xtask seed` 生成的确定性合成工作空间（2 个账本、分类/标签/流水/事件/日记/
  模板/图表/股票全链路/待办），53 个 schema 对象，约 59 KB。由
  `scripts/generate-legacy-seed-sql.mjs` 从旧版 SQLite 文件导出；导入器测试用它建旧库。
- `seed.dump.json`：同一工作空间的规范化 JSON dump（`cargo xtask dump`），用于核对
  行数与金额；**不提交真实个人数据**。

重新生成（需要旧仓库与已构建的 `xtask.exe`）：

```powershell
# 旧仓库根目录
.\target\debug\xtask.exe seed D:\temp\tr-legacy-ws
.\target\debug\xtask.exe dump D:\temp\tr-legacy-ws > <new>\fixtures\legacy\seed.dump.json
# 新仓库根目录
node scripts/generate-legacy-seed-sql.mjs D:\temp\tr-legacy-ws\transactions.db fixtures\legacy\seed.sql
```

真实个人数据绝不进入本目录。
