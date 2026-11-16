/**
 * 日记的响应形状（既有 `DTO diary.rs` + `wire.rs`）。
 *
 * 模型本身（`DiaryEntry` / `DiaryDateItem`）在 `shared/domain/models`；这里只放
 * 跨进程边界的 DTO。请求侧形状在 `shared/commands.ts` 的 zod 目录里，不在这里重复。
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
