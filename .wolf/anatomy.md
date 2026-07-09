# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-07-09T16:24:35.636Z
> Files: 90 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `CLAUDE.md` — CLAUDE.md (~3486 tok)
- `README.md` — Project documentation (~207 tok)

## .claude/


## .claude/rules/


## .codegraph/


## .superpowers/sdd/

- `progress.md` — SDD Progress Ledger (~90 tok)
- `task-1-report.md` — Task 1 Report: 主进程 IPC handlers (~527 tok)
- `task-2-fix-report.md` — Task 2 Fix Report: 同步按钮加载状态 + Popover 在同步期间保持打开 (~258 tok)
- `task-2-report.md` — Task 2 Report: Preload 扩展 + TypeScript 类型声明 (~282 tok)
- `task-3-report.md` — Task 3 Report: Pinia updateStore (~331 tok)
- `task-4-report.md` — Task 4 Report: Layout.vue — 下载中全局显示底部状态栏 (~144 tok)
- `task-5-report.md` — 状态 (~516 tok)
- `task-6-report.md` — Task 6 Report: AboutSetting.vue — 更新区域 UI (6 states) (~242 tok)

## C:/Users/ljw/.claude/plans/

- `tender-chasing-aho.md` — Go 后端 DI 重构 + Handler 包装器 (~435 tok)

## C:/Users/ljw/AppData/Local/Temp/

- `architecture-review-20260705-2.html` — 架构审查 — Transactions 个人财务应用 (~8855 tok)
- `architecture-review-20260705.html` — 架构审查 — Transactions (~8876 tok)

## app/

- `vite.config.ts` (~338 tok)

## app/src/


## app/src/backend/

- `chart.ts` — 按时间聚合的交易记录数据 (~1039 tok)
- `errorHandler.ts` — 查询模式：错误时通知并返回 fallback 值，不抛出。 (~216 tok)
- `functions.ts` — 将秒级时间戳转换为格式化时间字符串 (~360 tok)
- `imageOptimizer.ts` — 将 base64 data URI 转成 Blob (~614 tok)

## app/src/backend/api/

- `api-client.ts` — Check if the response indicates an error (code !== 0). (~973 tok)
- `category.ts` — Exports queryCategory, createCategory, deleteCategory, updateCategorySort + 2 more (~421 tok)
- `key-event.ts` — Exports queryKeyEventsByYear, queryKeyEventByDate, saveKeyEvent, deleteKeyEvent + 3 more (~545 tok)
- `tag.ts` — Exports queryTags, createTag, deleteTag, updateTagSort (~350 tok)

## app/src/components/

- `AppBottomBar.vue` — Vue: setup (~503 tok)
- `Layout.vue` — Vue: setup (~840 tok)

## app/src/components/common/


## app/src/components/da_view/

- `BilladmChartLines.vue` — Vue: setup (~2260 tok)
- `BilladmChartList.vue` — Vue: setup (~1151 tok)
- `BilladmChartView.vue` — Vue: setup (~1679 tok)
- `DataAnalysisView.vue` — Vue: setup (~2437 tok)

## app/src/components/key_event_view/

- `KeyEventDetail.vue` — Vue: setup (~2731 tok)
- `KeyEventImageGallery.vue` — Vue: setup (~1840 tok)
- `KeyEventLinkedTr.vue` — Vue: setup (~2131 tok)
- `KeyEventView.vue` — Vue: setup (~2347 tok)
- `UploadProgressBar.vue` — Vue: setup (~2069 tok)

## app/src/components/settings_view/

- `AboutSetting.vue` — Vue component (~1500 tok)
- `BilladmCategoryTagSetting.vue` — Vue component (~3433 tok)
- `BilladmTemplateSetting.vue` — Vue component (~2164 tok)
- `CategoryColumn.vue` — Vue component (~2507 tok)
- `GeneralSetting.vue` — Vue component (~897 tok)
- `SettingsView.vue` — Vue: setup (~1084 tok)
- `TagColumn.vue` — Vue component (~1820 tok)

## app/src/components/tr_view/

- `TransactionRecordTable.vue` — Vue: setup (~2755 tok)
- `TransactionRecordView.vue` — Vue: setup (~3918 tok)

## app/src/hooks/

- `useCategoryTags.ts` — src/hooks/useCategoryTags.ts (~520 tok)
- `useImageUpload.ts` — Exports UploadFileProgress, UploadProgress, UploadHandler, useImageUpload (~1214 tok)
- `useListDragSort.ts` — CSS 选择器，指定拖拽手柄元素（如 '.drag-handle'） (~477 tok)
- `useTransactionStats.ts` — Exports TransactionStats, useTransactionStats (~256 tok)

## app/src/router/


## app/src/stores/

- `chartStore.ts` — Exports ChartInstance, useChartStore (~1418 tok)
- `keyEventStore.ts` — Exports useKeyEventStore (~3236 tok)
- `ledgerStore.ts` — Exports useLedgerStore (~1116 tok)
- `transactionStore.ts` — Exports SortItem, useTransactionStore (~804 tok)
- `updateStore.ts` — Exports UpdateStatus, useUpdateStore (~1093 tok)

## app/src/styles/


## app/src/types/

- `electron.d.ts` — Declares __BUILD_TIME__ (~420 tok)

## build/

- `release.ps1` — release.ps1 - 一键将打包产物发布到 GitHub Release (~1345 tok)

## docs/


## docs/agents/

- `domain.md` — Domain Docs (~340 tok)
- `issue-tracker.md` — Issue tracker: Local Markdown (~437 tok)
- `triage-labels.md` — Triage Labels (~243 tok)

## docs/superpowers/plans/

- `2026-06-26-image-performance-optimization.md` — 图片加载性能优化（Blob + Canvas 缩略图） 实施计划 (~2278 tok)
- `2026-06-26-image-upload-progress.md` — 图片上传进度条 实施计划 (~3287 tok)
- `2026-06-26-key-event-preload.md` — 关键事件数据预加载与缓存 实施计划 (~3100 tok)
- `2026-06-26-key-event-transition.md` — 关键事件切换过渡动效 实施计划 (~2781 tok)
- `2026-06-28-single-instance-lock.md` — 单实例锁 实现计划 (~740 tok)
- `2026-06-29-general-setting.md` — 通用设置页 + DevTools 开关 实现计划 (~1786 tok)
- `2026-07-02-transaction-sync.md` — 消费记录同步 — 实施计划 (~1824 tok)
- `2026-07-10-auto-update.md` — 版本检查与自动更新 — 实施计划 (~6819 tok)

## docs/superpowers/specs/

- `2026-06-26-image-performance-optimization-design.md` — 关键事件图片加载性能优化设计 (~645 tok)
- `2026-06-26-image-upload-progress-design.md` — 图片上传进度条设计 (~1380 tok)
- `2026-06-26-key-event-preload-design.md` — 关键事件数据预加载与缓存设计 (~655 tok)
- `2026-06-26-key-event-transition-design.md` — 关键事件切换过渡动效设计 (~862 tok)
- `2026-06-28-single-instance-lock-design.md` — 单实例锁 设计规格 (~412 tok)
- `2026-06-29-general-setting-design.md` — 通用设置页 + DevTools 开关 设计规格 (~378 tok)
- `2026-07-02-transaction-sync-design.md` — 消费记录同步 — 设计规格 (~358 tok)
- `2026-07-10-auto-update-design.md` — 版本检查与自动更新 — 设计规格 (~1339 tok)

## electron/

- `electron-builder.yml` — - node_modules/** (~260 tok)

## electron/logs/


## electron/src/

- `main.js` — path: readTransactionsCfg, saveTransactionsCfg (~4570 tok)
- `preload.js` — Declares handler (~645 tok)

## kernel/

- `main.go` (~224 tok)

## kernel/api/

- `handler.go` — Handle, RequireWorkspace (~326 tok)
- `router.go` — ServeAPI, JsonArg (~785 tok)

## kernel/constant/


## kernel/dao/

- `transaction_record_dao.go` — Interface: TransactionRecordDao (~1167 tok)
- `transaction_record_tag_dao.go` — Interface: TrTagDao (~680 tok)

## kernel/logger/


## kernel/models/


## kernel/models/dto/


## kernel/pkg/operator/


## kernel/server/

- `wire.go` — InitServices (~330 tok)

## kernel/service/

- `category_service.go` — Interface: CategoryService (~1541 tok)
- `chart_service.go` — Interface: ChartService (~1938 tok)
- `key_event_image_service.go` — Interface: KeyEventImageService (~597 tok)
- `key_event_service.go` — Interface: KeyEventService (~930 tok)
- `ledger_service.go` — Interface: LedgerService (~1203 tok)
- `tag_service.go` — Interface: TagService (~1259 tok)
- `transaction_record_service.go` — Interface: TransactionRecordService (~3288 tok)
- `transaction_template_service.go` — Interface: TransactionTemplateService (~1001 tok)

## kernel/util/


## kernel/util/set/


## kernel/workspace/

- `seed.go` — GetDefaultData, SeedData (~677 tok)
