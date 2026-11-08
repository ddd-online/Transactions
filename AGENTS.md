# AGENTS.md

Transactions 是 Electron + React + TypeScript 桌面记账应用。每个工作空间是一个独立 SQLite 数据库。

## Agent skills

### Issue tracker

issue 与 spec 都记在 GitHub（`ddd-online/Transactions`），用 `gh` CLI 读写。见 `docs/agents/issue-tracker.md`。

### Triage labels

沿用默认的五个角色标签：`needs-triage` / `needs-info` / `ready-for-agent` / `ready-for-human` / `wontfix`。见 `docs/agents/triage-labels.md`。

### Domain docs

单上下文（single-context）：`CONTEXT.md` + `docs/adr/` 在仓库根，**按需创建** —— 第一次出现需要留档的术语或决策时再建，没有就先按模块头注释与「数据契约」办事。见 `docs/agents/domain.md`。

## 架构

| 目录 | 职责 |
|---|---|
| `electron/` | 主进程：窗口 / 托盘 / 单实例 / `app://` / `trasset://` / 配置 / 日志 / DB / 服务 / IPC / 更新 |
| `src/` | 渲染进程：React 19 + Ant Design 6 页面、组件、设计令牌与页面样式 |
| `shared/` | 主进程与渲染进程共用的命令目录、事件名、错误信封、领域纯逻辑与类型 |
| `tests/unit` | Vitest |
| `tests/e2e` | Playwright（真实 Electron + 落库断言） |
| `build/` | 构建、发布、安装包冒烟脚本 |
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
pnpm package          # NSIS 安装包，产物在 output/
```

`pnpm test:e2e:packaged` 走 `playwright.packaged.config.ts`（单 worker），需要先 `pnpm package:dir`，
再设 `$env:TRANSACTIONS_PACKAGED_EXE` 指向 `output/win-unpacked/Transactions.exe`。

## 发布纪律

- **只有用户明确说“发布”时才创建 GitHub Release**；开发、修复、提交、推送都不要自动跑
  `build/release.ps1` 或 `gh release create`。
- 日常改动最多本地 `pnpm build` / `pnpm package` 验证，不占用版本号、不更新 release。
- **`build/release_notes.md` 只留本次要发的版本那一节**：GitHub release 正文和应用内「关于 /
  更新」的更新日志都直接读它，历史条目留在各自版本的 release 里。静态护栏会拒绝多版本的
  文件；`build/release.ps1` 另外按 tag 再切一次，文件攒了历史也不会整份发出去。

## 提交纪律

- **每个完成的改动在验证通过后立即提交**，不要等用户再说“提交”。
- 一个 commit 只装一件事：功能、修复、设计重构、文档分开提交；不把无关改动混在一起。
- 提交前按上面的验证纪律跑受影响面；未验证或验证失败的改动不要提交。
- 提交信息沿用现有风格：`<type>(<scope>): <summary>`，正文用短横线列出关键点。

## 本机环境的硬事实

- **`ELECTRON_RUN_AS_NODE=1` 可能被全局设置**：Electron 会退化成 Node 直接退出。
  `pnpm dev` 走 `scripts/electron-env.mjs` 清掉；Playwright 在 `tests/e2e` 的 env 里清掉。
- Electron 二进制与 electron-builder 的下载需要代理：
  `HTTPS_PROXY=http://127.0.0.1:7890` + `ELECTRON_GET_USE_PROXY=1` + `GLOBAL_AGENT_HTTPS_PROXY`。
- 端口：开发服务使用 `16000`；生产不监听端口，只有 `app://` / `trasset://` 两个自定义协议。
- 别的目录可能有同名 `Transactions.exe`：按完整路径认本仓库实例。

## 验证纪律

- **默认按改动面收敛验证，不跑全量。** 顺序建议：
  1. TS 改动：`pnpm typecheck`
  2. 渲染层改动：先 `pnpm build`，再只跑受影响的 E2E spec（见下表；
     Playwright 启动的是 `output/out` 里的构建产物）
  3. `shared/domain`、`electron/`、IPC：跑对应单测
     （`pnpm exec vitest run tests/unit/<file>`）
  4. 版本 / 命令目录 / 构建与发布脚本 / 协议：`node scripts/static-guards.mjs`
- **全量 `pnpm test` / `pnpm test:e2e` 只在这些时候跑**：发布前；改了跨页面共享组件
  （`PageLayout`、`ScrollArea`、`Button`、`Modal` 等）或全局样式；路由或 IPC 契约改动；
  一次改动覆盖多个页面；或者定位不到受影响 spec。
- **全量 E2E 默认 4 并发**：`pnpm test:e2e` 直接按 4 个 worker 跑；
  `$env:TRANSACTIONS_E2E_WORKERS=1; pnpm test:e2e` 退回串行（正整数都可调，上限 16）。
  实测（16 逻辑核 / 27.9 GB 内存的 Windows 开发机、同一份 `pnpm build` 产物；数字取自并行化
  落地那次测量）：串行基线 **4 分 59 秒**（63 passed / 0 failed）→ 4 并发 **99–100.5 秒**
  （连跑三次 99.0 / 100.5 / 99.1，均值 99.5 秒），约为基线的 33%；并发时峰值 17 个 Electron
  进程、约 3.0 GB 工作集、整机 CPU 峰值占用约 47%。默认全量收集 **63 条、零 skipped、零 failed**。
- **什么时候退回串行**：定位只在并发下出现的失败（先查那条 spec 是否共享了临时路径、
  端口、单实例锁、对话框队列或构建产物，修隔离而不是加 retry），以及内存 / 磁盘吃紧的
  低配机。
- **`packaged.spec.ts` 始终单独跑**：它走自己的配置 `playwright.packaged.config.ts`
  （单 worker），默认全量里不收集它 —— 它要的是 `pnpm package:dir` 的安装目录，不和开发
  构建的实例混在一起。要跑：先 `pnpm package:dir`，再
  `$env:TRANSACTIONS_PACKAGED_EXE="…\output\win-unpacked\Transactions.exe"; pnpm test:e2e:packaged`。
- E2E 一律用一次性 `USERPROFILE`、`TRANSACTIONS_USER_DATA` 与临时工作空间，断言落在库/磁盘；
  **并发的前提是逐 spec 隔离**：对话框队列、需要改构建产物时自建应用副本 —— 新写 spec 必须
  继续自己建这些。并发下抓到过一处：`page-failure.spec.ts` 原来改名共享构建产物里的 chunk，
  同批跑股票页的 spec 会读不到 → 改成自建应用副本。
- 测试缝（仅测试环境变量）：`TRANSACTIONS_TEST_DIALOG_DIR` 绕过原生目录框；
  `TRANSACTIONS_TEST_CLOSE` 固定关闭行为；`TRANSACTIONS_USER_DATA` 隔离单实例锁；
  `TRANSACTIONS_TEST_PROXY_TARGET` 把代理连通性检测指向本地测试服务；
  `TRANSACTIONS_TEST_PROXY_ADDRESS` 固定自动探测返回的地址；
  `TRANSACTIONS_TEST_LIMIT_SOURCE` 把涨停池地址指到本地测试服务；
  `TRANSACTIONS_TEST_QUOTE_SOURCE` 把腾讯行情地址指到本地测试服务（天梯的断板涨跌幅、名称刷新）；
  `TRANSACTIONS_TEST_QUOTE_CHARSET` 让行情回包按 UTF-8 读（真源是 GBK，夹具服务器没有 GBK 编码器）；
  `TRANSACTIONS_TEST_LADDER_NOW` 钉住天梯服务的当前时间（验证开盘前不可看、盘中不入库）。
  生产构建不设置这些变量。

| 改动面 | 主要 E2E spec |
|---|---|
| 记账 / 记录 | `records.spec.ts`、`record-actions.spec.ts`、`time-range.spec.ts` |
| 分类标签 / 模板 | `tags.spec.ts`、`templates.spec.ts` |
| 事件 | `events.spec.ts` |
| 待办 | `todo.spec.ts`、`todo-drag.spec.ts` |
| 股票 | `stock.spec.ts`、`stock-lifecycle.spec.ts`、`stock-ladder.spec.ts` |
| 设置 | `settings.spec.ts` |
| 外壳 / 导航 / 窗口 | `shell.spec.ts`、`navigation.spec.ts`、`window*.spec.ts` |
| 更新 | `update*.spec.ts` |

命令示例：`pnpm build && pnpm exec playwright test tests/e2e/todo.spec.ts tests/e2e/todo-drag.spec.ts`。
样式改动也至少跑受影响页面的 spec，不要用全量截图代替针对性检查。

## 文件规模

- 每个源文件都有预算，超预算即静态护栏失败：页面模块（`src/pages/**/*.{ts,tsx}`）**450 行**；
  其他渲染层模块（`src/**/*.{ts,tsx}`）**500 行**；样式表（`src/styles/*.css`）**1200 行**；
  命令层单文件（`electron/ipc/**/*.ts`）**300 行**。`shared/` 与 `electron/services` 不设预算
  —— 规格只对页面 / 渲染层 / 命令层 / 样式设了预算。
- 允许清单在 `scripts/file-size-budget.mjs` 的 `FILE_SIZE_ALLOWLIST`，**它就是剩余工作清单**，不另建。
  三条规则：清单外超预算 → 失败；清单内超过登记 `cap` → 失败；文件降到预算内而条目还在 → 失败
  （必须删条目）。清单里的路径不存在也失败。
- 行数口径全仓库唯一：`text.split('\n').length - (text.endsWith('\n') ? 1 : 0)`（`countLines`）。
  别用 PowerShell 的 `Measure-Object`，它会少数几十行。
- 拆到预算内就**把条目删掉**；绝不能为了过护栏加条目、抬 `cap` 或调大 `BUDGETS`。新写的文件天然受限。
- **清单归零才算这件事做完**（规格 #4 的完成定义）。
- 什么时候该拆：一个文件混着多个职责、改一处要在上千行里重建上下文。不是为拆而拆 —— 一个
  600 行的纯渲染表格可能比两个 300 行的纠缠模块好；行数只是抓手，不是目标。

## 数据契约

- 金额恒为整数分；股票价格恒为整数厘。
- 股票费用只走 `shared/domain` 的费用算法；一次委托多笔成交时佣金按委托总额收一次。
- 时间戳在库里是 Unix 秒；日期分组按本地日期处理。
- 配置文件是用户数据：生产 `~/.tr.json`，开发 `~/.tr.dev.json`；保留未知键。
- 图片资产存工作空间 `data/assets`，走 `trasset://`（媒体要 Range）。HEIC 导入时转码成 JPEG 展示、原图另存；实况照片的动态部分单独存一份；删除图片时这几类文件一起清。
- 涨停池是市场数据：只信数据源自己给出的交易日（响应里的 `qdate`），与请求日期不一致就按「这天没有数据」处理；周末不请求、不入库，天梯默认落在最近一个交易日。把最近交易日的池子贴到周末上，比空着更糟。
- 断板当天的涨跌幅与价格不是涨停池给的，开盘涨跌幅也不是（池子里没有今开）：那天收盘定稿时从行情补到就写进 `stock_limit_quote`（每一行存开盘涨跌幅，断板行再存收盘涨跌幅与价格），之后看历史日直接读它。行情只给「最新一笔」，**没在这一天收盘后打开过应用，这一天就永远没有这几格** —— 不拿前后交易日的行情顶替，也不在盘中落库（那一刻的价格还会变）。
- 图表：一个账本只播种两张预设（月度 / 年度消费趋势），播种一次由 `app_meta` 的 `chart_seeded:<ledgerId>` 记住 —— 删掉之后不再补回来。预设只可删除：改名、改粒度、改曲线一律由服务层拒绝（文案 `PRESET_IMMUTABLE`）；自建图表的曲线增删改走 `chart_update` 整行回写。
- 退出时真正要落盘的只有两处：补写窗口位置（拖动/缩放是 300ms 防抖）与关闭工作空间（WAL 合并回主库）。配置与业务写操作都是即时同步落盘的，别在退出流程里重复做。退出会先虚化界面、亮出斜纹条（`app:quit-started` → 渲染层回执 `app_quit_ready` → 收尾 → `app.quit()`），托盘退出时窗口不可见，跳过这段等待。
- 备份形态：手动备份是**目录** `<备份位置>/Transactions-备份-YYYYMMDD-HHmmss/`（库快照 + `data/assets`），自动备份是单文件 `auto-YYYYMMDD.db`（只含库），恢复前的当前数据另存为 `pre-restore-YYYYMMDD-HHmmss.db`。快照一律用 `VACUUM INTO`（不复制 `-wal`/`-shm`，目标必须先不存在）；恢复手动备份会连图片一起还原，恢复单文件只换库、现有图片不动。
- 自动备份只在每天第一次打开工作空间时做一次，保留最近 7 份，**只裁它自己产生的 `auto-*.db`** —— 手动备份与 pre-restore 永远不参与裁剪。
- 恢复的顺序即契约：校验候选（只读打开 / `quick_check` / `app_meta` / 库版本不高于本程序）→ 目标盘剩余空间 → 先把当前库另存为 `pre-restore` → 关库 → 删 `transactions.db` 与 `-wal`/`-shm` → 写入快照 → 重启。恢复必然重启（内存里热换库要重建所有服务与缓存，代价高于重启）。
- 打开工作空间只做 `PRAGMA quick_check`（全量 `integrity_check` 留给备份与恢复两个显式动作）；库坏了报「工作空间数据库已损坏：<文件>（<原因>）。请到「设置 → 数据 → 从备份恢复」用备份还原。」，不自动修复、不静默建空库。
- 备份位置不得在工作空间内（含工作空间本身与任何子目录）：设置与真正写盘共用 `backupDirProblem` 这一处判断，拒绝时不写配置、不建目录、不产生文件。
