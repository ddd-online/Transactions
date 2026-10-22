# Transactions

Windows 桌面个人记账应用：本地优先、单工作空间多账本，覆盖记账、股票、事件、日记与待办。

## 技术栈

- Electron 44 + React 19 + TypeScript
- Vite / electron-vite 构建
- Node 内置 `node:sqlite`（WAL）
- 无原生模块、无本地监听端口
- 渲染进程 `sandbox` + `contextIsolation`，只经 preload 暴露的 `window.api` 访问主进程
- UI：Ant Design 6 提供通用控件，外观由 `--transactions-*` 令牌约束；页面骨架、图表、图片裁剪保持自研

## 功能

- 记账：记录 / 分析 / 分类标签 / 模板
- 股票：账户 / 持仓 / 记录 / 统计 / 设置
- 事件：事件列表、正文、图片、关联交易
- 日记：按日期保存、心情、字数、目录导入导出
- 待办：主题、事项、进度、四象限、历史
- 工作空间与多账本、按账本功能开关
- 本地数据导入、更新检查、代理设置

## 开发

```powershell
pnpm install
pnpm dev            # Vite + Electron（渲染层 HMR）
pnpm typecheck
pnpm test:unit      # Vitest
pnpm test:e2e       # 构建后运行 Playwright
pnpm package:dir    # output/win-unpacked/Transactions.exe
pnpm package        # NSIS 安装包 + 便携版到 output/
```

构建物料统一在 `output/`：

```text
output/
├─ out/       编译产物（main / preload / renderer）
├─ logs/      运行与构建日志
├─ win-unpacked/
└─ Transactions-<version>-setup.exe / portable.exe
```

## 目录

| 路径 | 职责 |
|---|---|
| `electron/` | 主进程：窗口、托盘、协议、配置、日志、数据库、服务、IPC、更新 |
| `src/` | React 页面、组件与样式 |
| `shared/` | 命令目录、事件、错误、领域纯逻辑、共享类型 |
| `tests/unit` | Vitest |
| `tests/e2e` | Playwright（真实 Electron + 落库断言） |
| `fixtures/` | 合成测试数据（不含真实个人数据） |
| `docs/adr/` | 当前 Electron 架构决策 |
| `output/` | 构建产物（不入库） |

## 数据与配置

- 生产配置：`~/.tr.json`
- 开发配置：`~/.tr.dev.json`
- 每个工作空间一个 SQLite 数据库：`transactions.db`
- 金额以整数分存储，股票价格以整数厘存储
- 图片资产保存在工作空间 `data/assets/`

## 测试

```powershell
pnpm test           # typecheck + Vitest + 静态护栏
pnpm test:e2e       # Playwright
```

E2E 使用一次性 `USERPROFILE`、`TRANSACTIONS_USER_DATA` 与临时工作空间，不触碰真实数据。

## 发布纪律

只有用户明确要求发布时才运行 `build/release.ps1` 或创建 GitHub Release。日常改动只构建、测试、提交、推送。

## License

Apache-2.0

