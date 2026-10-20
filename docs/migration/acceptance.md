# 迁移验收清单

> 对照旧版 `D:\github\Transactions-Rust`（0.20.0 / `77071cb`）与新仓库。
> 勾选只代表“有对等实现 + 有自动化证据”，不代表发布已完成。

## 1. 仓库与工具链

- [x] 新仓库 `D:\github\Transactions`，Electron + React 19 + TypeScript + Vite
- [x] 无 Rust / Tauri / Leptos / WASM / trunk 源码（静态护栏）
- [x] `pnpm dev` / `build` / `typecheck` / `test:unit` / `test:guards` / `test:e2e`
- [x] `electron-builder` NSIS + portable，`build/build.ps1` 产物断言
- [x] `build/clean.ps1`、`build/release.ps1`（Tag/版本/工作树/产物校验）

## 2. 外壳与安全

- [x] 无边框窗口、托盘、单实例、窗口状态事件
- [x] `contextIsolation` + `sandbox` + `nodeIntegration=false`
- [x] `app://` 渲染协议 + CSP；`trasset://` 资产协议 + realpath 防穿越
- [x] `window.api.invoke/onEvent`，命令名与事件名只在共享清单
- [x] 标题栏拖拽 + 最小化/最大化/关闭；最大化状态往返有 e2e
- [x] 首启动工作空间覆盖层；旧版工作空间错误路由到导入
- [x] 配置 `~/.transactions.json`（dev 后缀）键名保留、未知键保留
- [x] 关闭行为 / 外观 / 功能开关 / 系统或手动代理 / 工作空间图标

## 3. 数据与旧版导入

- [x] schema v1（25 表），金额分、股票价格厘、日期/时间戳后缀
- [x] 迁移执行器：连续版本、单事务、`VACUUM INTO` 备份、拒绝新版本
- [x] 0.20.0 一次性导入：只读源库、快照、表/列映射、金额合计校验、资产复制、报告、失败回滚
- [x] 导入向导 UI：探查、阶段进度、报告、自动打开新工作空间
- [x] Playwright 用 `fixtures/legacy/seed.sql` 跑通并核对行数/报告

## 4. 命令面

- [x] 旧版 117 条命令全部实现，另加 5 条新命令（导入/账户摘要/调试）
- [x] zod 请求边界 + 统一 `{code,msg,status}` 错误信封
- [x] `shared/commands.ts` 编译期对齐 handler 表

## 5. 功能页

- [x] 记账：看板、记录（筛选/异常/关联事件/模板/分类建议）、图表、分类标签、模板
- [x] 股票：账户/费用/资金记录、下单、持仓、历史、统计、复盘、重置/归档（服务层）
- [x] 事件：日期列表、正文、颜色、图片上传/缩略图/删除
- [x] 日记：列表、编辑、字数、目录导入导出
- [x] 待办：主题、事项、进度、完成历史
- [x] 设置：外观、关闭行为、代理、工作空间图标、旧版导入、更新

## 6. 更新与发布

- [x] 自研更新器：GitHub latest release、版本比较、`.exe` 资产、域名白名单
- [x] 流式下载 + SHA256 校验 + 取消 + 安装退出
- [x] 七状态更新面板（完整快照事件）
- [x] 1.0.0 发布说明与构建脚本
- [x] 打包产物冒烟 e2e；安装版/便携版已生成

## 7. 测试证据

| 项 | 当前结果 |
|---|---|
| Vitest | 587 条通过 |
| 静态护栏 | 9 项通过 |
| Playwright | 21 条通过 + 打包产物 1 条 |
| 安装版 | `dist/Transactions-1.0.0-setup.exe` |
| 便携版 | `dist/Transactions-1.0.0-portable.exe` |

## 8. 未完成（发布前必须清零）

- [x] 外壳/侧栏/导航复用旧版 `base.css` / `ui.css` / `app.css` 与 `nav-btn` 语言
- [x] 确认弹窗复用旧版 `ui-modal`（删除账本 / 重置股票 / 删除委托）
- [x] 底部提示复用旧版 `notice-message`（账本/记录/日记/股票/导入）
- [x] 空态复用旧版 `ui-empty`（图表/股票历史与统计/待办/记录/持仓）
- [x] 类型/异常标签复用旧版 `ui-tag`（记录表）
- [x] 记账与股票子功能切换复用旧版 `ui-tabs`
- [x] 事件图片裁剪复用 `ui-modal` + canvas 拖动选区，输出 JPEG
- [x] 日期输入复用旧版日历风格 DatePicker（事件/日记）
- [ ] 页面内 35 个组件（表格/弹窗/日期选择/图片裁剪等）逐页还原
- [x] 按账本功能开关（`ledgerFeatures`）的配置与界面
- [x] 股票归档/重置/操作回滚的界面入口
- [ ] 旧 26 个 UIA 护栏迁移为 Playwright（当前 21 条覆盖主链路）
- [ ] 发布前完整回归：安装版/便携版启动、旧数据导入、更新检查
- [ ] 切换文档与回滚步骤定稿

## 9. 切换步骤（草案）

1. 用旧版 0.20.0 打开一次目标工作空间，确认迁移到最新格式并备份。
2. 安装 `Transactions-1.0.0-setup.exe`（或运行便携版）。
3. 首启动选择新目录后，走「设置 → 导入旧版数据」，源目录选旧工作空间。
4. 核对导入报告、账本/记录/股票/事件/日记/待办数量与金额。
5. 旧目录保持只读备份；旧版应用不自动升级，可随时回退。



















