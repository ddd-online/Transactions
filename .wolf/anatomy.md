# anatomy.md

> Auto-maintained by OpenWolf. Last scanned: 2026-06-25T16:55:23.351Z
> Files: 199 tracked | Anatomy hits: 0 | Misses: 0

## ./

- `.gitignore` — Git ignore rules (~24 tok)
- `CLAUDE.md` — OpenWolf (~2265 tok)
- `LICENSE` — Project license (~3083 tok)
- `README.md` — Project documentation (~90 tok)

## .claude/

- `launch.json` (~145 tok)
- `settings.json` (~475 tok)
- `settings.local.json` (~185 tok)

## .claude/rules/

- `openwolf.md` (~313 tok)

## .codegraph/

- `.gitignore` — Git ignore rules (~61 tok)
- `daemon.log` (~67 tok)

## .superpowers/sdd/

- `progress.md` — SDD Progress Ledger (~56 tok)
- `task-1-fix-report.md` — SDD Task 1 Fix Report — HEIC Image Support Review Findings (~345 tok)
- `task-1-fix2-report.md` — Fix: wire imageUploading to disable upload button during HEIC conversion (~169 tok)
- `task-1-report.md` — Task 1 报告: HEIC 格式支持 (~218 tok)

## app/

- `.gitignore` — Git ignore rules (~74 tok)
- `index.html` — Transactions (~78 tok)
- `package-lock.json` — npm lock file (~51561 tok)
- `package.json` — Node.js package manifest (~297 tok)
- `tsconfig.app.json` — /*.ts", (~163 tok)
- `tsconfig.json` — TypeScript configuration (~36 tok)
- `tsconfig.node.json` (~195 tok)
- `vite.config.ts` — Vite build configuration (~255 tok)

## app/src/

- `App.vue` — Vue: setup, TS (~201 tok)
- `main.ts` — dayjs 中文支持 (~303 tok)

## app/src/backend/

- `chart.ts` — 按时间聚合的交易记录数据 (~1521 tok)
- `constant.ts` — Exports TransactionTypeToLabel, TransactionTypeToColor, TimeRangeValueToLabel, TimeRangeLabelToValue (~139 tok)
- `dto-utils.ts` — 构造符合后端 TransactionRecordDto 的请求对象 表单数据转化为dto (~398 tok)
- `functions.ts` — 将秒级时间戳转换为格式化时间字符串 (~2264 tok)
- `notification.ts` — Declares NotificationUtil (~298 tok)
- `timerange.ts` — 设置日期为当天的开始: 00:00:00.000 (~1451 tok)

## app/src/backend/api/

- `api-client.ts` — Check if the response indicates an error (code !== 0). (~961 tok)
- `category.ts` — Exports queryCategory, createCategory, deleteCategory, updateCategorySort + 2 more (~413 tok)
- `chart.ts` — Exports ChartDto, CreateChartRequest, UpdateChartRequest, queryCharts + 3 more (~366 tok)
- `key-event.ts` — Exports queryKeyEventsByYear, queryKeyEventByDate, saveKeyEvent, deleteKeyEvent + 3 more (~446 tok)
- `ledger.ts` — Exports queryAllLedgers, createLedger, modifyLedger, deleteLedgerById (~206 tok)
- `tag.ts` — Exports queryTags, createTag, deleteTag, updateTagSort (~334 tok)
- `template.ts` — Exports TransactionTemplateDto, createTemplate, queryTemplates, deleteTemplate, updateTemplateSort (~328 tok)
- `tr.ts` — Exports queryTrOnCondition, ChartQueryResponse, ChartQueryRequest, queryChartData + 6 more (~548 tok)
- `workspace.ts` — Exports openWorkspace (~57 tok)

## app/src/components/

- `AppBottomBar.vue` — Vue: setup, TS (~224 tok)
- `AppLeftBar.vue` — Vue: setup, TS (~2181 tok)
- `AppTopBar.vue` — Vue: setup, TS (~395 tok)
- `BilladmFileSelect.vue` — 选择模式：'file' 表示选择文件，'directory' 表示选择目录 (~474 tok)
- `Layout.vue` — Vue: setup, TS (~888 tok)

## app/src/components/common/

- `BilladmPageHeader.vue` — Vue: setup, TS, 1 props (~187 tok)
- `BilladmPageLayout.vue` — Vue component (~255 tok)
- `BilladmStatisticsFooter.vue` — Vue: setup, TS (~733 tok)
- `BilladmTimeRangePicker.vue` — Vue: setup, TS (~872 tok)
- `TransactionRecordFilter.vue` — Vue: setup, TS (~2196 tok)

## app/src/components/da_view/

- `BilladmChart.vue` — Vue: setup, TS (~848 tok)
- `BilladmChartLines.vue` — Vue: setup, TS, emits (~2228 tok)
- `BilladmChartList.vue` — Vue: setup, TS, emits (~1523 tok)
- `BilladmChartView.vue` — Vue: setup, TS, emits (~1679 tok)
- `DataAnalysisView.vue` — Vue: setup, TS (~3009 tok)

## app/src/components/key_event_view/

- `KeyEventAddModal.vue` — Vue: setup, TS, emits (~527 tok)
- `KeyEventDetail.vue` — Vue: setup (~1872 tok)
- `KeyEventImageGallery.vue` — Vue: setup, TS, 1 props, emits (~1633 tok)
- `KeyEventLinkedTr.vue` — Vue: setup, TS, emits (~1931 tok)
- `KeyEventList.vue` — Vue: setup, TS, emits (~1615 tok)
- `KeyEventView.vue` — Vue: setup (~2554 tok)

## app/src/components/settings_view/

- `AboutSetting.vue` — Vue: TS (~836 tok)
- `BilladmCategoryTagSetting.vue` — Vue: TS (~3223 tok)
- `BilladmTemplateSetting.vue` — Vue: TS (~1763 tok)
- `CategoryColumn.vue` — Vue: TS, 5 props, emits (~2435 tok)
- `SettingsView.vue` — Vue: setup, TS (~1090 tok)
- `TagColumn.vue` — Vue: TS, 2 props, emits (~1719 tok)
- `WorkspaceSetting.vue` — Vue: TS (~758 tok)

## app/src/components/tr_view/

- `TransactionRecordTable.vue` — Vue: setup, TS, emits (~1970 tok)
- `TransactionRecordView.vue` — Vue: setup, TS (~4142 tok)
- `TrSortModal.vue` — Vue: setup, TS, emits (~883 tok)

## app/src/hooks/

- `useCategoryTags.ts` — src/hooks/useCategoryTags.ts (~430 tok)

## app/src/router/

- `router.ts` — Declares routes (~325 tok)

## app/src/stores/

- `appDataStore.ts` — Exports useAppDataStore (~166 tok)
- `keyEventStore.ts` — Exports useKeyEventStore (~1565 tok)
- `ledgerStore.ts` — Exports useLedgerStore (~990 tok)
- `trQueryConditionStore.ts` — Exports useTrQueryConditionStore (~235 tok)

## app/src/styles/

- `_components.scss` — Transactions Components (~2566 tok)
- `_layout.scss` — Transactions Layout (~1760 tok)
- `_mixins.scss` — Transactions Mixins (~1272 tok)
- `_typography.scss` — Billadm Typography (~2132 tok)
- `_variables.scss` — Transactions Design Tokens (~2558 tok)
- `index.scss` — Transactions Global Styles (~5150 tok)

## app/src/types/

- `billadm.d.ts` — 表示一个前端使用的消费记录 (~941 tok)
- `components.d.ts` — @ts-nocheck (~1512 tok)
- `electron.d.ts` — Declares __BUILD_TIME__ (~152 tok)

## docs/

- `frontend-features.md` — Transactions 功能说明 (~712 tok)

## docs/superpowers/plans/

- `2026-04-12-mcp-server-implementation.md` — MCP Server 实现计划 (~6652 tok)
- `2026-04-20-layout-refactor-plan.md` — Layout Refactor Implementation Plan (~620 tok)
- `2026-04-20-ledgerview-floating-button-plan.md` — LedgerView 悬浮按钮实现计划 (~780 tok)
- `2026-04-26-key-event-plan.md` — 关键事件 (Key Event) 页面实现计划 (~6166 tok)
- `2026-04-26-key-event-ui-polish-plan.md` — 关键事件页面 UI 优化实现计划 (~891 tok)
- `2026-04-28-key-event-color-plan.md` — 关键事件颜色标记实现计划 (~2096 tok)
- `2026-04-28-key-event-title-plan.md` — 关键事件标题功能实现计划 (~2569 tok)
- `2026-04-29-ledger-typography-refresh.md` — Ledger Page Typography Refresh — Implementation Plan (~2145 tok)
- `2026-05-06-linked-transactions-summary-plan.md` — 关联交易统计指标 — 实现计划 (~767 tok)
- `2026-05-06-tr-key-event-link-plan.md` — 交易记录关联关键事件 — 实现计划 (~7521 tok)
- `2026-05-08-key-event-image-plan.md` — Key Event Image Support Implementation Plan (~5727 tok)
- `2026-06-17-layout-restructuring-plan.md` — Layout Restructuring Implementation Plan (~4617 tok)
- `2026-06-17-per-ledger-category-tag.md` — 按账本隔离分类与标签 — 实现计划 (~7992 tok)
- `2026-06-19-frontend-refactor-plan.md` — Frontend 重构实施计划 (~8952 tok)
- `2026-06-19-key-event-color-toolbar.md` — 关键事件颜色设置重构 实现计划 (~2059 tok)
- `2026-06-19-key-event-image-gallery-plan.md` — KeyEventImageGallery 实现计划 (~1475 tok)
- `2026-06-19-key-event-ledger-scope-plan.md` — 关键事件关联账本 — 实现计划 (~1930 tok)
- `2026-06-19-key-event-three-column-plan.md` — 关键记录页面三栏布局重构 实现计划 (~7177 tok)
- `2026-06-20-ixd-optimization-plan.md` — 交互设计优化实施计划 (~2342 tok)
- `2026-06-26-heic-image-support-plan.md` — HEIC 图片格式支持 — 实现计划 (~1018 tok)

## docs/superpowers/specs/

- `2026-04-12-mcp-server-design.md` — MCP Server 设计文档 (~1290 tok)
- `2026-04-20-layout-refactor-design.md` — Layout Refactor Design (~412 tok)
- `2026-04-20-ledgerview-floating-button-design.md` — LedgerView 悬浮按钮设计 (~201 tok)
- `2026-04-26-key-event-design.md` — 关键事件 (Key Event) 页面设计 (~743 tok)
- `2026-04-26-key-event-ui-polish-design.md` — 关键事件页面 UI 优化设计 (~519 tok)
- `2026-04-27-key-event-title-design.md` — 关键事件标题 + Hover 预览 设计 (~694 tok)
- `2026-04-28-key-event-color-design.md` — 关键事件颜色标记设计 (~1070 tok)
- `2026-04-29-ledger-typography-design.md` — Ledger Page Typography Refresh (~697 tok)
- `2026-05-06-linked-transactions-summary-design.md` — 关联交易统计指标设计 (~578 tok)
- `2026-05-06-tr-key-event-link-design.md` — 交易记录关联关键事件设计 (~852 tok)
- `2026-05-08-key-event-image-design.md` — Key Event Image Support Design (~1380 tok)
- `2026-06-17-layout-restructuring-design.md` — Layout Restructuring Design (~1010 tok)
- `2026-06-17-per-ledger-category-tag-design.md` — 按账本隔离分类与标签 — 设计文档 (~628 tok)
- `2026-06-19-frontend-refactor-design.md` — Frontend 重构设计文档 (~427 tok)
- `2026-06-19-key-event-color-toolbar-design.md` — 关键事件颜色设置重构 (~1023 tok)
- `2026-06-19-key-event-image-gallery-design.md` — KeyEventImageGallery 图片画廊组件设计 (~385 tok)
- `2026-06-19-key-event-ledger-scope-design.md` — 关键事件关联账本 — 设计文档 (~537 tok)
- `2026-06-19-key-event-three-column-design.md` — 关键记录页面三栏布局重构设计 (~1172 tok)
- `2026-06-26-heic-image-support-design.md` — HEIC 图片格式支持 — 设计文档 (~746 tok)

## electron/

- `.gitignore` — Git ignore rules (~26 tok)
- `electron-builder.yml` — - node_modules/** (~239 tok)
- `package-lock.json` — npm lock file (~47618 tok)
- `package.json` — Node.js package manifest (~100 tok)

## electron/logs/

- `app.log` (~26 tok)

## electron/src/

- `init.html` — 欢迎使用 Transactions (~3068 tok)
- `main.js` — path: readTransactionsCfg, saveTransactionsCfg (~2140 tok)
- `preload.js` (~292 tok)

## kernel/

- `go.mod` — Go module definition (~486 tok)
- `go.sum` — Go dependency checksums (~2455 tok)
- `main.go` (~230 tok)

## kernel/api/

- `app_controller.go` (~164 tok)
- `category_controller.go` (~1168 tok)
- `chart_controller.go` (~647 tok)
- `key_event_controller.go` (~1797 tok)
- `ledger_controller.go` (~1167 tok)
- `router.go` — ServeAPI, JsonArg (~831 tok)
- `tag_controller.go` (~899 tok)
- `transaction_record_controller.go` (~1534 tok)
- `transaction_template_controller.go` (~781 tok)
- `workspace_controller.go` (~170 tok)

## kernel/constant/

- `constant.go` (~72 tok)

## kernel/dao/

- `category_dao.go` — Interface: CategoryDao (32 methods) (~1068 tok)
- `chart_dao.go` — Interface: ChartDao (24 methods) (~618 tok)
- `key_event_dao.go` — Interface: KeyEventDao (10 methods) (~503 tok)
- `key_event_image_dao.go` — Interface: KeyEventImageDao (10 methods) (~473 tok)
- `ledger_dao.go` — Interface: LedgerDao (14 methods) (~520 tok)
- `tag_dao.go` — Interface: TagDao (28 methods) (~957 tok)
- `transaction_record_dao.go` — Interface: TransactionRecordDao (33 methods) (~1294 tok)
- `transaction_record_tag_dao.go` — Interface: TrTagDao (16 methods) (~779 tok)
- `transaction_template_dao.go` — Interface: TransactionTemplateDao (27 methods) (~774 tok)

## kernel/logger/

- `logger_test.go` — TestLogger (~116 tok)
- `logger.go` — package logger (~367 tok)

## kernel/models/

- `category.go` — Category (5 fields); methods: TableName (~156 tok)
- `chart.go` — QueryConditionItem 查询条件项 (~503 tok)
- `key_event.go` — KeyEvent (16 fields); methods: TableName, TableName (~372 tok)
- `ledger.go` — Ledger (6 fields); methods: TableName (~140 tok)
- `result.go` — Result (5 fields) (~102 tok)
- `tag.go` — Tag (5 fields); methods: TableName (~162 tok)
- `transaction_record_flags.go` — TransactionRecordFlags (2 fields) (~26 tok)
- `transaction_record_tag.go` — TrTag (4 fields); methods: TableName (~99 tok)
- `transaction_record.go` — Transaction types are defined in constant package. (~356 tok)
- `transaction_template.go` — TransactionTemplate 消费记录模板 (~292 tok)

## kernel/models/dto/

- `category_dto.go` — CategoryDto (19 fields); methods: ToCategory, FromCategory (~376 tok)
- `chart_dto.go` — ChartDto (28 fields) (~486 tok)
- `chart_query.go` — ChartLineCondition (15 fields) (~361 tok)
- `ledger_dto.go` — LedgerDto (6 fields); methods: ToLedger, FromLedger (~241 tok)
- `query_condition.go` — TrQueryCondition (20 fields); methods: Validate (~446 tok)
- `tag_dto.go` — TagDto (16 fields); methods: ToTag, FromTag (~372 tok)
- `tr_query_result.go` — TrQueryResult (3 fields) (~62 tok)
- `transaction_record_dto.go` — TransactionRecordDto (27 fields); methods: Validate, ToTransactionRecord, FromTransactionRecord (~850 tok)
- `transaction_template_dto.go` — TransactionTemplateDto (23 fields); methods: Validate, ToTransactionTemplate, FromTransactionTemplate (~704 tok)

## kernel/pkg/operator/

- `sort_tr_dtos.go` — SortField (27 fields); methods: Len, Swap, Less (~414 tok)
- `tr_operator.go` — TrOperator (52 fields); methods: Add, Filter, Sort, Page (~1131 tok)

## kernel/server/

- `server.go` — NewGinServer (~252 tok)

## kernel/service/

- `category_service.go` — Interface: CategoryService (14 methods) (~1604 tok)
- `chart_service.go` — Interface: ChartService (11 methods) (~1239 tok)
- `key_event_image_service.go` — Interface: KeyEventImageService (10 methods) (~639 tok)
- `key_event_service.go` — Interface: KeyEventService (11 methods) (~919 tok)
- `ledger_service.go` — Interface: LedgerService (12 methods) (~1292 tok)
- `tag_service.go` — Interface: TagService (12 methods) (~1183 tok)
- `transaction_record_service.go` — Interface: TransactionRecordService (26 methods) (~3521 tok)
- `transaction_template_service.go` — Interface: TransactionTemplateService (10 methods) (~1137 tok)

## kernel/util/

- `config.go` — BilladmConfig (8 fields) (~309 tok)
- `database.go` — NewDbInstance (~280 tok)
- `file.go` — WriteStringToFile (~83 tok)
- `path.go` — GetRootDir, GetDistDir, IsDirectoryExists, IsFileExists (~222 tok)
- `string.go` — GetRandomString (~71 tok)
- `uuid_test.go` — TestGetUUID (~48 tok)
- `uuid.go` — GetUUID (~39 tok)

## kernel/util/set/

- `set.go` — provides a generic Set implementation. (~741 tok)

## kernel/workspace/

- `seed.go` — GetDefaultData, SeedData (~725 tok)
- `workspace_manager.go` — WsManager (12 fields); methods: OpenWorkspace, OpenedWorkspace, Close (~283 tok)
- `workspace.go` — Workspace (13 fields); methods: GetDb, GetDirectory, Transaction, Close (~398 tok)
