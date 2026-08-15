---
name: release
description: 执行 Transactions 项目的发布流程：版本升级、构建、打包、发布到 GitHub Release。
---

# Release 发布流程（沙箱适配版）

三步完成发布：版本号 → 构建打包 → 推送发布。

**本版本不再依赖 `build/*.ps1` 子进程脚本**：在 DSH 沙箱环境中，`pwsh.exe -File build/x.ps1` 以及脚本内部派生的子进程（esbuild 管道 spawn、Go 构建缓存写工作区外路径、ssh.exe 信号管道）会被沙箱拒绝。因此流程改为**由 agent 直接逐条执行各步骤的命令**（内容等价于原脚本内部逻辑）。`build/clean.ps1`、`build/build.ps1`、`build/release.ps1` 仍保留在仓库，供非沙箱环境或人工使用，但本 skill 不依赖它们。

## 沙箱执行约定（先读）

- 每条命令直接用 pwsh 工具执行，**不要**用 `pwsh.exe -File ...` 再套一层子进程。
- 常见沙箱拒绝标记：
  - `[sandbox: file access denied under ... mode]` — 文件策略拒绝
  - `spawn EPERM` — esbuild / Node 以管道 stdio 派生子进程（如 `npm run build` 内嵌的 vite/esbuild）
  - `Access is denied` — 写工作区外路径（Go 构建缓存 `%LOCALAPPDATA%\go-build`、electron-builder 缓存、go telemetry）
  - `couldn't create signal pipe`（ssh.exe）— `git fetch/push/ls-remote`（本仓库 remote 为 SSH）
- 遇到上述标记：把**同一条命令**以 `sandbox_permissions: danger-full-access` 重试一次并附一句 justification；这是沙箱规则允许的唯一例外。
- 若会话审批被禁用（approval=never）或升级被拒：不得绕过，停止并如实报告阻塞点。
- 长命令（构建、95MB 上传）放后台任务（`run_in_background: true`），完成后用 job_output 收集结果，不要空转等待。

## 前置检查

- 工作区干净（`git status --short` 无未提交改动；与发布无关的未跟踪文件除外）。
- `gh` 已登录：`gh auth status`。
- 目标版本尚未发布：
  - `gh release view vX.Y.Z`（报错/不存在才可继续）
  - `git tag -l "vX.Y.Z"`（无输出才可继续；**本地 tag 存在但 GitHub Release 不存在时，属于上一轮中断，需先核对 tag 指向再决定复用或新版本**）
- 当前版本：`(Get-Content electron/package.json | ConvertFrom-Json).version`（版本号唯一定义处）。

## Step 1: 版本号

版本号定义在 `electron/package.json`（构建脚本从这里读取），`electron/package-lock.json` 内嵌版本需保持一致。推荐 `npm version` 自动同步两者：

```powershell
cd electron
npm version X.Y.Z --no-git-tag-version
cd ..
git add electron/package.json electron/package-lock.json
git commit -m "chore: bump version to X.Y.Z"
```

**完成条件**：`electron/package.json` 与 `electron/package-lock.json` 版本号均为目标版本，且已提交。

## Step 2: 清理旧产物（原 clean.ps1 逻辑）

在仓库根目录执行：

```powershell
$paths = @(
  'app/dist', 'kernel/transactions.exe', 'electron/dist', 'electron/logs',
  'build/target', 'electron/transactions.exe',
  'kernel/nul.exe'
)
foreach ($p in $paths) { if (Test-Path $p) { Remove-Item $p -Recurse -Force } }
```

**完成条件**：上述路径均不存在。

## Step 3: 构建（原 build.ps1 逻辑，逐条执行）

### 3.1 前端 Vue

```powershell
cd app
npm run build
```

- 注意：vite 会经 esbuild 以管道 stdio 派生子进程，沙箱下报 `spawn EPERM` → 用 `danger-full-access` 重试同一条命令。
- 失败时 `vue-tsc` 会先报类型错误，需修复源码后重跑 3.1。
- **完成条件**：`app/dist` 生成（`.gitignore` 覆盖，无需提交）。

### 3.2 后端 Go

```powershell
cd kernel
$env:GOOS = 'windows'; $env:GOARCH = 'amd64'; $env:CGO_ENABLED = '0'
go build -ldflags '-s -w' -o transactions.exe
```

- 注意：Go 构建缓存写入 `%LOCALAPPDATA%\go-build`（工作区外），沙箱报 `Access is denied` → 升级重试。
- CGO 不参与编译（`glebarez/sqlite` 纯 Go），无需 gcc。
- **完成条件**：`kernel/transactions.exe` 存在。

### 3.3 拷贝产物到 electron

```powershell
Remove-Item electron/dist, electron/transactions.exe -Recurse -Force -ErrorAction SilentlyContinue
Copy-Item app/dist electron/dist -Recurse -Force
Copy-Item kernel/transactions.exe electron/ -Force
```

**完成条件**：`electron/dist` 与 `electron/transactions.exe` 存在。

### 3.4 Electron 打包（NSIS 安装器）

```powershell
cd electron
npm run package   # electron-builder --config electron-builder.yml --publish=never
```

- electron-builder 需要 Electron/NSIS 资源：首次或缓存缺失时会下载，自动读取 Windows 系统代理（`HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings` 的 ProxyServer）。若报 `connect ETIMEDOUT`：先探测系统代理可用性，`$env:HTTPS_PROXY = "http://<host>:<port>"`（HTTP_PROXY 同理）后重试。
- 注意：electron-builder 会派生子进程并写缓存（`%LOCALAPPDATA%\electron-builder`），沙箱拒绝时升级重试。
- **完成条件**：`build/target/Transactions-x64-vX.Y.Z.exe` 存在。

## Step 4: 推送 main 与 tag（发布前，保证 tag 指向构建提交）

```powershell
git tag vX.Y.Z                 # 本地 tag 指向当前 HEAD（构建提交）
git push origin main
git push origin vX.Y.Z
```

- 注意：remote 为 SSH（`git@github.com`），沙箱下 ssh.exe 报 `couldn't create signal pipe` → 升级重试。
- **必须发布前先推送**：否则 `gh release create` 会按远端默认分支 tip 打 tag，导致 tag 指向比实际构建更早的提交。
- **完成条件**：`git rev-parse vX.Y.Z` 与 `git rev-parse HEAD` 一致，且远端已存在（`git ls-remote --tags origin vX.Y.Z` 确认，SSH 失败则升级）。

## Step 5: 生成发布说明并发布

1. 从 `git log --oneline <prevTag>..HEAD` 获取变更，按功能分组总结（`feat`→新增、`fix`→修复、`perf`/`refactor`→改进，`chore` 忽略）。写入临时文件（Windows 下用 `Out-File -Encoding UTF8` 保证编码）。

2. 发布（gh 走 HTTPS 直连，无需 git/ssh；上传大文件建议后台任务）：

```powershell
gh release create vX.Y.Z "build/target/Transactions-x64-vX.Y.Z.exe" --title "Transactions vX.Y.Z" --notes-file "$env:TEMP\release-notes.md"
```

- 若上传慢/失败且系统代理可用：`$env:HTTPS_PROXY = "http://<proxy>"` 后重试。
- **完成条件**：输出 Release URL，且 `gh release view vX.Y.Z` 可见标题、说明与安装包资产（非草稿、非预发布）。

## Step 6: 善后

```powershell
git status                       # 如有遗留改动（如 lockfile 同步），提交并推送
git fetch --tags origin
git rev-parse vX.Y.Z             # 应与当前 HEAD / bump 提交一致
gh release view vX.Y.Z           # 复核：非草稿、非预发布、资产在线
```

## 故障处理

| 失败点 | 原因 | 处理 |
|--------|------|------|
| 3.1 报 `spawn EPERM` | 沙箱禁止 esbuild 管道 spawn | 同一条命令以 `danger-full-access` 重试一次 |
| 3.1 TS 错误 | `vue-tsc` 类型检查失败 | 根据错误信息修复源码，重跑 3.1 |
| 3.2 `Access is denied` | Go 构建缓存写工作区外被拒 | 升级重试；仍失败检查 Go 版本与依赖缓存 |
| 3.4 `connect ETIMEDOUT` | electron-builder 下载 Electron/NSIS 直连超时 | 探测系统代理并设置 `HTTPS_PROXY`/`HTTP_PROXY` 后重跑 |
| 3.4 沙箱拒绝 | electron-builder 子进程/缓存 | 升级重试 |
| Step 4 ssh `couldn't create signal pipe` | 沙箱禁止 ssh.exe | 升级重试；仍失败改用 `gh` 相关操作 |
| Step 5 gh 未登录 | `gh auth login` 未执行 | 终端执行 `gh auth login` 后重试 |
| Step 5 产物路径不对 | 版本号与产物文件名不匹配 | 核对 `electron/package.json` 版本，重跑 3.1–3.4 |
| Step 5 上传失败 `proxyconnect tcp ... refused` | 代理已配置但不可达 | 关闭代理直连，或改用可用代理 |
| tag 指向旧提交 | 发版时本地提交未推送，gh 按远端默认分支 tip 打 tag | 发布前先做 Step 4；已发生则 `git tag -f vX.Y.Z <实际构建提交>` 后 `git push --force origin refs/tags/vX.Y.Z`（Release 与资产保留，属改写远端，需确认后操作） |

## 维护

- 本 skill 的仓库源文件为 `.dsh/skills/release/SKILL.md`。如需安装到 DSH 用户级目录（供其他项目使用），同步到 `~/.dsh/skills/release/SKILL.md`，新副本在下一轮对话生效：

  ```powershell
  Copy-Item -LiteralPath ".dsh\skills\release\SKILL.md" -Destination "$env:USERPROFILE\.dsh\skills\release\SKILL.md" -Force
  ```
