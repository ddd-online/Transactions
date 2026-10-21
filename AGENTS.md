# AGENTS.md

Transactions 是 Electron + React + TypeScript 桌面记账应用。每个工作空间是一个独立 SQLite 数据库。

## 架构

| 目录 | 职责 |
|---|---|
| `electron/` | 主进程：窗口 / 托盘 / 单实例 / `app://` / `trasset://` / 配置 / 日志 / DB / 服务 / IPC / 更新 |
| `src/` | 渲染进程：React 19 + Ant Design 6 页面、组件、设计令牌与页面样式 |
| `shared/` | 主进程与渲染进程共用的命令目录、事件名、错误信封、领域纯逻辑与类型 |
| `tests/unit` | Vitest |
| `tests/e2e` | Playwright（真实 Electron + 落库断言） |
| `build/` | 构建、发布、便携版冒烟脚本 |
| `fixtures/` | 合成测试数据，不含真实个人数据 |
| `output/` | 构建物料（不入库） |

## 常用命令

```powershell
pnpm dev              # electron-vite dev（渲染层 HMR）
pnpm build            # output/out/main + output/out/preload + output/out/renderer
pnpm typecheck        # tsc --noEmit
pnpm test:unit        # Vitest
pnpm test:e2e         # 先 build 再 Playwright（真实 Electron）
pnpm package:dir      # output/win-unpacked/Transactions.exe（E2E 可用）
pnpm package          # NSIS + portable，产物在 output/
```

`pnpm test:e2e:packaged` 需要先 `pnpm package:dir`，并设置 `TRANSACTIONS_PACKAGED_EXE` 指向
`output/win-unpacked/Transactions.exe`。

## 发布纪律

- **只有用户明确说“发布”时才创建 GitHub Release**；开发、修复、提交、推送都不要自动跑
  `build/release.ps1` 或 `gh release create`。
- 日常改动最多本地 `pnpm build` / `pnpm package` 验证，不占用版本号、不更新 release。

## 本机环境的硬事实

- **`ELECTRON_RUN_AS_NODE=1` 可能被全局设置**：Electron 会退化成 Node 直接退出。
  `pnpm dev` 走 `scripts/electron-env.mjs` 清掉；Playwright 在 `tests/e2e` 的 env 里清掉。
- Electron 二进制与 electron-builder 的下载需要代理：
  `HTTPS_PROXY=http://127.0.0.1:7890` + `ELECTRON_GET_USE_PROXY=1` + `GLOBAL_AGENT_HTTPS_PROXY`。
- 端口：开发服务使用 `16000`；生产不监听端口，只有 `app://` / `trasset://` 两个自定义协议。
- 别的目录可能有同名 `Transactions.exe`：按完整路径认本仓库实例。

## 验证纪律

- 能机器判定的别靠人读：`typecheck` / `test:unit` / `test:e2e` / 静态护栏。
- E2E 一律用一次性 `USERPROFILE`、`TRANSACTIONS_USER_DATA` 与临时工作空间；断言落在库/磁盘。
- 测试缝（仅测试环境变量）：`TRANSACTIONS_TEST_DIALOG_DIR` 绕过原生目录框；
  `TRANSACTIONS_TEST_CLOSE` 固定关闭行为；`TRANSACTIONS_USER_DATA` 隔离单实例锁。
  生产构建不设置这些变量。

## 数据契约

- 金额恒为整数分；股票价格恒为整数厘。
- 股票费用只走 `shared/domain` 的费用算法；一次委托多笔成交时佣金按委托总额收一次。
- 时间戳在库里是 Unix 秒；日期分组按本地日期处理。
- 配置文件是用户数据：生产 `~/.tr.json`，开发 `~/.tr.dev.json`；保留未知键。
- 图片资产存工作空间 `data/assets`，走 `trasset://`。
