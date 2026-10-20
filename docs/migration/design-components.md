# 旧版 UI 组件 → Electron/React 映射

> 对照 `D:\github\Transactions-Rust\crates\tr-ui\src\components\ui`（0.20.0 / `77071cb`）。
> 旧目录含 32 个组件模块；本仓库按页面实际使用保留等价实现，未使用的 `drawer` /
> `dropdown` 不搬空壳。样式优先复用旧版 `base.css` / `ui.css` / `app.css` 的类名。

| # | 旧组件 | 新实现 | 证据 |
|---|---|---|---|
| 1 | `async_section` | 页面 loading/busy 标志 + `Spin` | 导入、股票、记录加载态 |
| 2 | `button` | 原生 button + 旧版 `ui-btn` / 页面按钮类 | `ConfirmDialog`、各页操作 |
| 3 | `card` | `m0-card` / `ui-card` 样式 | 各功能页分块 |
| 4 | `chart` | `src/pages/charts.tsx` SVG 折线 | `records.spec.ts` 图表断言 |
| 5 | `checkbox` | 原生 checkbox（保留可访问语义） | 功能开关、待办完成 |
| 6 | `date_picker` | `src/components/date-picker.tsx` | 事件/日记日期、日历点选 e2e |
| 7 | `divider` | 边框/分隔线样式，无独立组件 | 卡片/表格分隔 |
| 8 | `drag_sort` | 待办主题 HTML5 拖动 + `todo_card_sort` | `todo-drag.spec.ts` |
| 9 | `drawer` | 旧页面未使用，未搬空壳 | — |
| 10 | `dropdown` | 旧页面未使用，行内操作替代 | — |
| 11 | `empty` | `src/components/empty-state.tsx` | 图表/股票/待办/记录 |
| 12 | `feature_page` | `App.tsx` 的 view 切换 | `navigation.spec.ts` |
| 13 | `form` | `m0-field` 标签 + 原生控件 | 设置/记录/股票表单 |
| 14 | `image_crop` | `src/components/image-crop.tsx` | 事件图片裁剪 e2e |
| 15 | `image_picker` | file input + 裁剪 | `events.spec.ts` |
| 16 | `input` | 原生 input + `m0-input` | 全部表单 |
| 17 | `markdown` | `src/components/markdown.tsx` | 事件正文预览 |
| 18 | `modal` | `src/components/confirm-dialog.tsx`（`ui-modal`） | 删除账本/重置股票/删委托 |
| 19 | `page_header` | `src/components/page-header.tsx` | 顶栏标题布局 |
| 20 | `pagination` | `src/components/pagination.tsx` | 记录分页 |
| 21 | `popconfirm` | `ConfirmDialog` | 同上 |
| 22 | `popover` | DatePicker 弹层 | 日历点选 |
| 23 | `progress` | `src/components/progress.tsx` | 待办进度 |
| 24 | `segmented` | `src/components/segmented.tsx` | 图表按月/按年 |
| 25 | `select` | 原生 select + `m0-input` | 筛选/股票表单 |
| 26 | `spin` | `src/components/spin.tsx` | 导入进行中 |
| 27 | `switch` | `src/components/switch.tsx`（`ui-switch`） | 设置功能开关 |
| 28 | `tabs` | 旧版 `ui-tabs` / `ui-tabs__tab` | 记账/股票子功能 |
| 29 | `tag` | 旧版 `ui-tag` | 记录类型/异常 |
| 30 | `textarea` | 原生 textarea + `m0-input` | 事件/日记/复盘 |
| 31 | `time_range_picker` | 原生日期 + 图表周期预设 | 图表/统计区间 |
| 32 | `tooltip` | `src/components/tooltip.tsx`（`ui-tooltip`） | 事件图片删除 |

## 说明

- 金额、股票价格、费用等业务组件不在此表，见 `status.md` 的领域层说明。
- 旧 `drawer` / `dropdown` 没有页面调用点；若后续新增抽屉/菜单交互，按旧类名补组件，
  不预先搬空壳。
- 组件样式以设计令牌为准；浅/深色切换由 `<html data-theme>` 驱动。
