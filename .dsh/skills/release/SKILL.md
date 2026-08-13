---
name: release
description: 执行 Transactions 项目的发布流程：版本升级、构建、打包、发布到 GitHub Release。
---

# Release 发布流程

三步完成发布：版本号 → 构建打包 → 总结变更并发布到 GitHub Release。

## 前置检查

- 工作区干净（所有改动已提交）
- `gh` CLI 已安装且已登录（`gh auth status`）

## Step 1: 版本号

版本号定义在 `electron/package.json`（构建/发布脚本从这里读取），`electron/package-lock.json` 内嵌版本需保持一致。

先确认目标版本尚未发布过，避免重复发版：

```powershell
gh release view vX.Y.Z    # 报错/不存在才可继续
git tag -l "vX.Y.Z"       # 无输出才可继续
```

修改版本号（推荐 `npm version`，自动同步 package.json 与 package-lock.json）：

```powershell
cd electron
npm version X.Y.Z --no-git-tag-version
cd ..
git add electron/package.json electron/package-lock.json
git commit -m "chore: bump version to X.Y.Z"
```

**完成条件**：`electron/package.json` 与 `electron/package-lock.json` 版本号均为目标版本，且已提交。

## Step 2: Clean → Build

两个脚本串联执行。构建过程可能触发 TS 类型错误，需要根据错误信息修复源码后重试。

```bash
pwsh.exe -ExecutionPolicy Bypass -File "build/clean.ps1"
pwsh.exe -ExecutionPolicy Bypass -File "build/build.ps1"
```

- `clean.ps1` — 清理旧构建产物
- `build.ps1` — Vue 类型检查 + 构建 → Go 编译 → Electron 打包（NSIS 安装器输出到 `build/target/`）。脚本已内置 Windows 系统代理检测，electron-builder 下载 Electron/NSIS 资源时自动走代理

**完成条件**：输出 "整个构建与打包流程已完成"，产物 `build/target/Transactions-x64-vX.Y.Z.exe` 存在。

## Step 3: 生成 Release Body 并发布

`release.ps1` 支持 `-BodyFile` 参数（指向发布说明文件，推荐），也支持 `-Body`（命令行字符串，有 bash 转义风险）。不传参数则自动从 `git log` 生成。

先拉取 tag、获取变更列表：

```bash
git fetch --tags origin
git log --oneline <prevTag>..HEAD
```

根据 `git log` 输出，将提交历史总结为简洁的发布说明。用中文组织，**按功能分组**而非逐条罗列：`feat` → 新增、`fix` → 修复、`perf`/`refactor` → 性能与重构，`chore` 类噪音可忽略。写入临时文件（Windows 下用 `Out-File` 保证 UTF-8）：

```powershell
$notes = @'
## 新增

- xxx

## 修复

- xxx

## 改进

- xxx
'@
$notes | Out-File -FilePath "$env:TEMP\release_notes.md" -Encoding UTF8
```

然后调用 `release.ps1`，通过 `-BodyFile` 传入文件路径（避免命令行转义问题）：

```powershell
echo Y | pwsh.exe -ExecutionPolicy Bypass -File "build/release.ps1" -BodyFile "$env:TEMP\release_notes.md"
```

- `release.ps1` 需要交互确认，用 `echo Y` 管道自动确认
- `-BodyFile` 的内容直接作为 Release Notes（UTF-8 编码）

> ⚠️ **Tag 与构建提交一致性**：`release.ps1` 通过 gh 创建 Release 时，若本地提交尚未推送到远端，gh 会按远端默认分支 tip 打 tag，导致 tag 指向比实际构建更早的提交（产物与发布说明不受影响，但后续 `git log vX.Y.Z..HEAD` 会统计出重复变更）。发布前先推送 main 可避免：

```powershell
git push origin main
```

发布后校验 tag 指向：

```powershell
git fetch --tags origin
git rev-parse vX.Y.Z     # 应与当前 HEAD / bump 提交一致
```

若不一致，按"故障处理"中的方法修正。

**完成条件**：输出 "GitHub Release vX.Y.Z 发布成功！"，且 `gh release view vX.Y.Z` 可见发布与资产。

## Step 4: 善后

构建过程中可能修复了 TS 类型错误，或 npm 同步了 lockfile 版本。发布完成后检查 `git status`，如有未提交的改动一并提交并推送：

```powershell
git status
git add -A && git commit -m "chore: 同步 lockfile 版本"  # 如有需要
git push
```

最后用 `gh release view vX.Y.Z` 复核 Release 状态（非草稿、非预发布）与安装包资产已上线，并确认 tag 指向构建提交（`git rev-parse vX.Y.Z` 与当前 HEAD 一致）。

## 故障处理

| 失败点 | 原因 | 处理 |
|--------|------|------|
| `build.ps1` TS 错误 | `vue-tsc` 类型检查失败 | 根据错误信息修复源码，重新执行 `build.ps1` |
| `build.ps1` Go 编译失败 | 依赖或环境问题 | 项目使用 `CGO_ENABLED=0` 纯 Go 编译（`glebarez/sqlite` 无需 gcc），重点检查 Go 版本与依赖缓存 |
| `build.ps1` Electron 打包失败 `connect ETIMEDOUT` | electron-builder 下载 Electron/NSIS 资源直连 GitHub 超时 | `build.ps1` 已自动检测系统代理；仍失败则手动设置 `HTTPS_PROXY`/`HTTP_PROXY` 后重跑 |
| `release.ps1` gh 未登录 | `gh auth login` 未执行过 | 终端中执行 `gh auth login`，完成后重试 |
| `release.ps1` 产物路径不对 | 版本号与产物文件名不匹配 | 确认版本号正确，重新执行 `build.ps1` |
| Release tag 指向旧提交 | 发版时本地提交尚未推送，gh 按远端默认分支 tip 打 tag | 发布前先 `git push origin main`；已发生时修正：`git tag -f vX.Y.Z <实际构建提交>` 后 `git push --force origin refs/tags/vX.Y.Z`（Release 与资产保留，属改写远端，需确认后操作） |
| 上传失败 `proxyconnect tcp ... refused` | 代理已配置但不可达 | `release.ps1` 会 TCP 探测代理可用性（1.5s 超时），不可用则自动直连 |
| 上传速度极慢 | `gh` CLI 不走系统代理，直连 GitHub | `release.ps1` 现已自动检测 Windows 系统代理（`HKCU\...\ProxyServer`）并设置 `HTTPS_PROXY` |

## 维护

- 本 skill 的仓库源文件为 `.dsh/skills/release/SKILL.md`。如需安装到 DSH 用户级目录（供其他项目使用），同步到 `~/.dsh/skills/release/SKILL.md`，新副本在下一轮对话生效：

  ```powershell
  Copy-Item -LiteralPath ".dsh\skills\release\SKILL.md" -Destination "$env:USERPROFILE\.dsh\skills\release\SKILL.md" -Force
  ```
