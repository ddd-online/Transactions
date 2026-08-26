---
name: release
description: 执行 Transactions 项目的发布流程：版本升级、构建、打包、发布到 GitHub Release。
---

# Release 发布流程

三步完成发布：版本号 → 构建打包（`build/build.ps1`） → 推送并发布（`build/release.ps1`）。

发布流程直接复用 `build/` 下的 PowerShell 脚本，agent 只负责按顺序调用并核对完成条件：

| 脚本 | 职责 |
|------|------|
| `build/clean.ps1` | 清理旧构建产物 |
| `build/build.ps1` | 构建 Vue + Go 并打包 Electron NSIS 安装器 |
| `build/release.ps1` | 检查 gh 登录、生成发布说明、创建 GitHub Release |

脚本内部已处理输出编码、代理检测、产物校验与 gh 认证检查，不需要再逐条复述其内部命令。

## 执行约定

- 在仓库根目录用 `powershell -ExecutionPolicy Bypass -File .\build\<script>.ps1` 调用；执行策略允许时也可直接 `.\build\<script>.ps1`。
- 脚本失败会以非零退出码结束并在输出中指明失败步骤；先修原因，再重跑对应脚本。
- `build.ps1` 与 `release.ps1` 都会自动检测系统代理并设置 `HTTPS_PROXY`/`HTTP_PROXY`（仅在环境变量未设置时）。需要手动覆盖时，在调用前设置这两个变量即可；SSH 通道不读代理。

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

## Step 2: 清理旧产物

```powershell
powershell -ExecutionPolicy Bypass -File .\build\clean.ps1
```

脚本删除 `app/dist`、`kernel/transactions.exe`、`electron/dist`、`electron/logs`、`build/target`、`electron/transactions.exe`、`kernel/nul.exe`（含历史遗留产物）。

**完成条件**：上述路径均不存在。

## Step 3: 构建打包

```powershell
powershell -ExecutionPolicy Bypass -File .\build\build.ps1
```

脚本依次完成：自动检测代理 → 构建 Vue（`npm run build`，含 `vue-tsc` 类型检查）→ 构建 Go 后端（`GOOS=windows`、`GOARCH=amd64`、`CGO_ENABLED=0`，输出 `kernel/transactions.exe`）→ 拷贝前端 dist 与后端 exe 到 `electron/` → electron-builder NSIS 打包（`npm run package`）。

- 前端类型错误时 `vue-tsc` 会先失败，需修复源码后重跑本步。
- electron-builder 首次打包会下载 Electron/NSIS 资源，脚本已自动处理代理。

**完成条件**：`build/target/Transactions-x64-vX.Y.Z.exe` 存在。

## Step 4: 推送 main 与 tag（发布前，保证 tag 指向构建提交）

```powershell
git tag vX.Y.Z                 # 本地 tag 指向当前 HEAD（构建提交）
git push origin main
git push origin vX.Y.Z
```

- **必须发布前先推送**：否则 `gh release create` 会按远端默认分支 tip 打 tag，导致 tag 指向比实际构建更早的提交。
- 本仓库 remote 为 SSH（`git@github.com`）；SSH 不读 `HTTPS_PROXY`，直连握手慢属正常。如需加速推送，可选（不默认执行，需用户确认）：
  - `~/.ssh/config` 为 github.com 配 `ProxyCommand`（Git for Windows 未自带 connect.exe，需自行安装或使用 `ssh -W` 方案）；
  - 或临时切 HTTPS remote：`gh auth setup-git` 后 `git remote set-url origin https://github.com/ddd-online/Transactions.git`，此时 `git config --global http.proxy http://<host>:<port>` 生效；发布完成可改回 SSH。

**完成条件**：`git rev-parse vX.Y.Z` 与 `git rev-parse HEAD` 一致，且远端已存在（`git ls-remote --tags origin vX.Y.Z` 确认）。

## Step 5: 发布

```powershell
powershell -ExecutionPolicy Bypass -File .\build\release.ps1
```

脚本自动：读取 `electron/package.json` 版本 → 定位 `build/target/Transactions-*-vX.Y.Z.exe` → 检查 gh 登录与代理 → 生成发布说明 → 打印摘要并请求确认 → `gh release create`。脚本用 `Read-Host` 等待确认：先向用户展示摘要并征得同意，再以交互式终端运行，确认时输入 `Y` 发布（其他输入取消）。

发布说明优先级：`-BodyFile` > `-Body` > git changelog（`git log <上一条 tag>..HEAD`）。需要自定义说明时传参：

```powershell
powershell -ExecutionPolicy Bypass -File .\build\release.ps1 -BodyFile "D:\github\Transactions\build\release-notes.md"
```

- 发布说明文件用 UTF-8 编码；用仓库绝对路径最稳，避免临时目录被清理。
- 若上传中断：`gh release view vX.Y.Z` 可能留下**草稿 Release**（无资产）——不必删草稿重建，直接 `gh release upload vX.Y.Z "build/target/Transactions-x64-vX.Y.Z.exe"`（代理存在时同命令设置 `HTTPS_PROXY`/`HTTP_PROXY`）补传，再 `gh release edit vX.Y.Z --draft=false` 转正式。

**完成条件**：输出 Release URL，且 `gh release view vX.Y.Z` 可见标题、说明与安装包资产（非草稿、非预发布）。

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
| clean/build 脚本退出码非零 | 脚本内某一步失败 | 看脚本输出定位步骤（Vue/Go/Electron），修复后重跑对应脚本 |
| build 阶段 TS 错误 | `vue-tsc` 类型检查失败 | 根据错误信息修复源码，重跑 build.ps1 |
| electron-builder 下载超时 | Electron/NSIS 资源下载慢 | 脚本已自动检测代理；仍失败则在调用前手动设置 `HTTPS_PROXY`/`HTTP_PROXY` 后重跑 |
| Step 4 ssh 失败 | SSH 通道不可用 | 检查 SSH 配置；或按 Step 4 的可选方案临时切 HTTPS remote |
| Step 5 gh 未登录 | `gh auth login` 未执行 | 终端执行 `gh auth login` 后重试 |
| Step 5 产物路径不对 | 版本号与产物文件名不匹配 | 核对 `electron/package.json` 版本与 `build/target` 文件名，重跑 build.ps1 |
| Step 5 上传慢/超时 | 直连慢 | release.ps1 已设置代理；仍失败检查代理可用性或直连重试，也可用 `gh release upload` 补传 |
| Step 5 create 中断留草稿 | 上传未完成，`gh release create` 已建草稿 | 不必删除重建：`gh release upload vX.Y.Z <exe>` 补传 + `gh release edit vX.Y.Z --draft=false` 转正式 |
| tag 指向旧提交 | 发版时本地提交未推送，gh 按远端默认分支 tip 打 tag | 发布前先做 Step 4；已发生则 `git tag -f vX.Y.Z <实际构建提交>` 后 `git push --force origin refs/tags/vX.Y.Z`（Release 与资产保留，属改写远端，需确认后操作） |

## 维护

- 本 skill 的仓库源文件为 `.codex/skills/release/SKILL.md`；发布逻辑以 `build/*.ps1` 为准。脚本行为变更时，同步更新本 skill 中的流程与完成条件说明。
