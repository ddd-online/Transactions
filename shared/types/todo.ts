/**
 * 待办的模型 / DTO / 请求形状（旧 `tr-domain/src/models/todo.rs` +
 * `tr-domain/src/dto/todo.rs` + `tr-domain/src/wire.rs` 的待办段）。
 *
 * 两条命名纪律（与旧实现逐字一致，**不允许"顺手统一"**）：
 * * 库列名 / 模型字段在 DAO 层显式映射；模型对外是 camelCase（`ledgerId` / `cardId` …）；
 * * 请求字段保持旧 wire 的 snake_case（`ledger_id` / `card_id` / `start_date` …）——
 *   它是 IPC 契约的一部分。旧结构体全部 `#[serde(default)]`，缺字段时字符串退化为空串、
 *   数值退化为 0、布尔退化为 false，所以请求类型里的载荷字段都是可选的。
 *
 * 「完成」不是搬表：事项留在 `todo_item` 里，只把 `status` 置成 `done` 并记
 * `completed_at`。卡片视图只取进行中的、历史视图只取已完成的，是同一张表的两个 WHERE。
 */

/** 待办卡片（一个「主题」）。表 `todo_card`。 */
export interface TodoCard {
  id: string
  ledgerId: string
  /** 卡片主题（新建时校验 / 截断到 200 个字符） */
  title: string
  createdAt: number
  updatedAt: number
  /** 排列序号（拖动排序；新建的取当前最大值 + 1） */
  sortOrder: number
}

/**
 * 待办事项。表 `todo_item`。
 *
 * `startDate` / `dueDate` 是**日粒度**的 `YYYY-MM-DD`（空串 = 没填）。
 */
export interface TodoItem {
  id: string
  ledgerId: string
  cardId: string
  title: string
  startDate: string
  dueDate: string
  /** 紧急度：六档之一（-5 / -3 / -1 / 1 / 3 / 5） */
  urgency: number
  /** 重要度：六档之一（-5 / -3 / -1 / 1 / 3 / 5） */
  importance: number
  /** `doing` / `done` */
  status: string
  /** 完成时刻（未完成 = 0） */
  completedAt: number
  createdAt: number
  updatedAt: number
}

/**
 * 一条进度记录。表 `todo_progress`。
 *
 * 只增不写：记录写完不提供「编辑」（要改就删了重记），`createdAt` 就是记录时间。
 */
export interface TodoProgress {
  id: string
  ledgerId: string
  itemId: string
  /** 进度正文（新建时校验 / 截断到 2000 个字符） */
  content: string
  /** 这条进度是否已打勾完成 */
  done: boolean
  createdAt: number
}

/** 一条进度记录（对外不带 `ledgerId`：它属于哪个账本由事项决定）。 */
export interface TodoProgressDto {
  id: string
  itemId: string
  content: string
  done: boolean
  createdAt: number
}

/** 卡片视图里的一条事项（进行中）。进度记录按时间升序内嵌。 */
export interface TodoItemDto {
  id: string
  cardId: string
  title: string
  startDate: string
  dueDate: string
  urgency: number
  importance: number
  status: string
  completedAt: number
  createdAt: number
  updatedAt: number
  progress: TodoProgressDto[]
}

/** 一张卡片 + 它下面进行中的事项（卡片没有事项时 `items` 为空）。 */
export interface TodoCardDto {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  items: TodoItemDto[]
}

/**
 * 历史里的一条：已完成的事项 + **主题名**（卡片被删时这条跟着删，不会出现空主题）。
 *
 * 与卡片视图的 `TodoItemDto` 相比，这里没有 `status` / `createdAt` / `updatedAt`
 * （历史只关心「什么时候完成」），多一个 `cardTitle`。
 */
export interface TodoHistoryDto {
  id: string
  cardId: string
  cardTitle: string
  title: string
  startDate: string
  dueDate: string
  urgency: number
  importance: number
  completedAt: number
  progress: TodoProgressDto[]
}

/** `todo_cards` 的请求：卡片视图（某账本）。 */
export interface TodoLedgerRequest {
  ledger_id: string
}

/** 删除类命令的请求（只有 id）；行本来来自当前账本，删除不再带账本。 */
export interface TodoIdRequest {
  id: string
}

/** `todo_card_create` 的请求。 */
export interface TodoCardCreateRequest {
  ledger_id: string
  title?: string | null
}

/** `todo_item_create` 的请求（`urgency` / `importance` 是六档之一）。 */
export interface TodoItemCreateRequest {
  ledger_id: string
  card_id: string
  title?: string | null
  start_date?: string | null
  due_date?: string | null
  urgency?: number | null
  importance?: number | null
}

/** `todo_item_update` 的请求：**不动**状态（完成 / 取消完成走 `TodoItemStatusRequest`）。 */
export interface TodoItemUpdateRequest {
  ledger_id: string
  id: string
  title?: string | null
  start_date?: string | null
  due_date?: string | null
  urgency?: number | null
  importance?: number | null
}

/** `todo_item_status` 的请求：`doing` / `done`（改 `done` 写完成时刻，改回 `doing` 清掉）。 */
export interface TodoItemStatusRequest {
  ledger_id: string
  id: string
  status?: string | null
}

/** `todo_progress_add` 的请求。 */
export interface TodoProgressCreateRequest {
  ledger_id: string
  item_id: string
  content?: string | null
}

/** `todo_card_sort` 的请求：把一张卡片挪到 `sort_order`（只按 id）。 */
export interface TodoCardSortRequest {
  id: string
  sort_order?: number | null
}

/** `todo_progress_done` 的请求：给一条进度记录打勾 / 取消打勾。 */
export interface TodoProgressDoneRequest {
  id: string
  done?: boolean | null
}
