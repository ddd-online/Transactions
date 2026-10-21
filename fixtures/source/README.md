# fixtures/source

导入器测试使用的源格式基线，全部为合成数据。

- `fresh.sql`：源格式数据库的完整 DDL，导入器按此识别源库。
- `seed.sql`：确定性合成工作空间（2 个账本、分类/标签/流水/事件/日记/模板/图表/股票/待办）。
- `seed.dump.json`：同一工作空间的规范化 JSON dump，用于核对行数与金额。

重新生成：

```powershell
node scripts/generate-source-seed-sql.mjs <source.db> fixtures\source\seed.sql
```

真实个人数据绝不进入本目录。
