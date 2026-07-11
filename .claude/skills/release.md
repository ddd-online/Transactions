---
name: release
description: 执行 Transactions 项目的发布流程：版本升级、构建、打包、发布到 GitHub Release。
disable-model-invocation: true
---

# Release 发布流程

三步完成发布：版本号 → 构建打包 → 总结变更并发布到 GitHub Release。

## 前置检查

- 工作区干净（所有改动已提交）
- `gh` CLI 已安装且已登录（`gh auth status`）

## Step 1: 版本号

如果尚未升级版本，修改 `electron/package.json` 中的 `"version"` 字段（唯一的版本定义位置）。提交该变更：

```bash
git add electron/package.json && git commit -m "chore: bump version to x.y.z"
```

**完成条件**：`electron/package.json` 版本号为目标版本，且已提交。

## Step 2: Clean → Build

两个脚本串联执行。构建过程可能触发 TS 类型错误，需要根据错误信息修复源码后重试。

```bash
pwsh.exe -ExecutionPolicy Bypass -File "build/clean.ps1" && \
pwsh.exe -ExecutionPolicy Bypass -File "build/build.ps1"
```

- `clean.ps1` — 清理旧构建产物
- `build.ps1` — Vue 类型检查 + 构建 → Go 编译 → Electron 打包（NSIS 安装器输出到 `build/target/`）

**完成条件**：输出 "整个构建与打包流程已完成"，产物 `build/target/Transactions-x64-vX.Y.Z.exe` 存在。

## Step 3: 生成 Release Body 并发布

`release.ps1` 支持 `-Body` 参数（不带则自动生成 `git log --oneline` 列表）。

先拉取 tag、获取变更列表：

```bash
git fetch --tags origin
git log --oneline <prevTag>..HEAD
```

根据 `git log` 输出，将提交历史总结为简洁的发布说明。用中文组织，**按功能分组**而非逐条罗列，格式类似：

```
## 新增

- xxx

## 修复

- xxx

## 改进

- xxx
```

然后调用 `release.ps1`，传入 body（单行用 `\n` 换行）：

```bash
echo Y | pwsh.exe -ExecutionPolicy Bypass -File "build/release.ps1" -Body "## 新增\n\n- xxx\n\n## 修复\n\n- xxx"
```

- `-Body` 的内容直接作为 Release Notes
- `release.ps1` 需要交互确认，用 `echo Y` 管道自动确认

**完成条件**：输出 "GitHub Release vX.Y.Z 发布成功！"

## Step 4: 善后

构建过程中可能修复了 TS 类型错误。发布完成后检查 `git status`，如有未提交的修复一并提交并推送：

```bash
git add -A && git commit -m "fix: 构建中修复的 TS 类型错误"  # 如有需要
git push
```

## 故障处理

| 失败点 | 原因 | 处理 |
|--------|------|------|
| `build.ps1` TS 错误 | `vue-tsc` 类型检查失败 | 根据错误信息修复源码，重新执行 `build.ps1` |
| `build.ps1` Go 编译失败 | CGO 或依赖问题 | 检查 `CGO_ENABLED=1`，确认 gcc 可用 |
| `release.ps1` gh 未登录 | `gh auth login` 未执行过 | 终端中执行 `gh auth login`，完成后重试 |
| `release.ps1` 产物路径不对 | 版本号与产物文件名不匹配 | 确认版本号正确，重新执行 `build.ps1` |
