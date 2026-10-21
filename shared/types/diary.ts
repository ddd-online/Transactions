/**
 * 日记的请求 / 响应形状（既有 `DTO diary.rs` + `wire.rs`）。
 *
 * 模型本身（`DiaryEntry` / `DiaryDateItem`）在 `shared/domain/models`；这里只放
 * 跨进程边界的 DTO。
 *
 * **请求字段保持既有 wire 的 snake_case**：`ledger_id` 是账本的硬契约（与
 * `tr_linked_by_date` 等命令一致），不是内部模型的 camelCase。既有 DTO 全部
 * `缺省字段`：缺字段时字符串退化为空串、`Option` 退化 `None`，请求类型里
 * 用可选字段表达这一层默认。
 *
 * **日记按账本隔离**：除扫描目录（纯文件系统操作）外，所有请求都带 `ledger_id`。
 */

/** 一个待导入的日记文件。 */
export interface DiaryFileItem {
  /** `YYYY-MM-DD`（取自文件名） */
  date: string
  /** 文件路径（扫描目录时是相对 / 绝对路径的原样拼接） */
  path: string
}

/** 扫描结果，形状为 `{"files": [...]}`。 */
export interface DiaryScanResponse {
  files: DiaryFileItem[]
}

/** 导出失败的单个文件。 */
export interface DiaryExportFileError {
  date: string
  error: string
}

/** 导出结果汇总。 */
export interface DiaryExportResult {
  total: number
  success: number
  failed: DiaryExportFileError[]
}

/** `diary_list_dates` 的请求：某账本的日期列表。 */
export interface DiaryLedgerRequest {
  ledger_id: string
}

/** `diary_get` / `diary_delete` 的请求：某账本某天。 */
export interface DiaryDateRequest {
  ledger_id: string
  date: string
}

/** `diary_import_scan` 的请求：纯文件系统操作，**没有** `ledger_id`。 */
export interface DiaryScanRequest {
  directory: string
}

/** `diary_import_file` 的请求：把单个文件导入指定账本。 */
export interface DiaryImportFileRequest {
  ledger_id: string
  path: string
  date: string
}

/**
 * 日记写入请求体：账本、日期、正文与心情。
 *
 * `content` / `mood` 缺省（或为 `null`）时按空串处理；`ledger_id` 缺席由 IPC 层拒绝。
 */
export interface DiaryUpsertRequest {
  ledger_id: string
  date: string
  content?: string | null
  mood?: string | null
}

/**
 * `diary_export` 的请求体：`year` / `month` 缺省（或为 `null`）表示 0，即不限
 * （`month` 需配合 `year`）。导出**只导 `ledger_id` 这一个账本**。
 */
export interface DiaryExportRequest {
  ledger_id: string
  directory: string
  year?: number | null
  month?: number | null
}
