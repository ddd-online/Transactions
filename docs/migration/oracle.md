# 迁移参照（oracle）

旧仓库：`D:\github\Transactions-Rust`，迁移基线 commit `77071cb`，版本 0.20.0。
新仓库**不复制 Rust 源码**；需要对照行为或生成 fixture 时在旧仓库执行。

## 已复制到新仓库的资产

| 文件 | 来源 | 用途 |
|---|---|---|
| `src/styles/*.css` + `fonts/*.woff2` | `crates/tr-ui/static/` | 视觉/布局基线，迁移期原样复用 |
| `resources/icon.ico` | `src-tauri/icons/icon.ico` | 窗口/托盘/安装包图标 |
| `LICENSE` / `DESIGN.md` / `PRODUCT.md` | 仓库根 | 许可证与设计与产品约束 |
| `fixtures/legacy/fresh.sql` | `fixtures/schema/fresh.sql` | 旧库结构说明（导入源格式，不是新库基线） |
| `fixtures/heic/*` | `fixtures/heic/` | HEIC 解码测试图（合成数据） |
| `build/release_template.md` / `release_notes.md` | `build/` | 发布说明模板，M6 改写 |

## 生成旧库 fixture（一次性）

```powershell
cd D:\github\Transactions-Rust
cargo xtask seed D:\temp\tr-legacy-ws          # 确定性种子工作空间（仅合成数据）
sqlite3 D:\temp\tr-legacy-ws\transactions.db .dump > D:\github\Transactions\fixtures\legacy\seed.sql
cargo xtask dump D:\temp\tr-legacy-ws > D:\github\Transactions\fixtures\legacy\seed.dump.json
```

导入器测试用 `seed.sql` 建旧库，导入新库后逐表核对行数与金额合计。

## 行为 oracle

- 领域规则（money / fee / fund / stock / statistics / update / proxy）与 `tr-draw` 的几何算法：
  以旧仓库的源码与 `#[cfg(test)]` 为准，逐条移植测试，不重新设计。
- 旧版界面护栏（26 个 PowerShell 脚本）：判据逐条迁移到 `tests/e2e`，不在新仓库保留 UIA 依赖。
- 旧版真实数据只在用户本机副本上演练，禁止提交。

## 旧仓库不再使用的部分

`src-tauri/`（外壳）、`Cargo.toml` / `crates/` / `xtask/`（Rust）、`Trunk.toml`（WASM 构建）、
`fixtures/*.ps1` 与 `fixtures/lib/TrUia.ps1`（UIA 护栏）在 M6 由新栈对等物替代后即停止使用。
