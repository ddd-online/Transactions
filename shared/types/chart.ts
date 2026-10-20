/**
 * 图表 DAO 的 wire 形状（对应旧 `tr-domain/src/dto/core.rs` 的图表 DTO）。
 *
 * 字段名与旧契约一致（camelCase）；模型本身在 `shared/domain/models`。
 * `chartLines` 的 JSON 编解码只在服务层做，DTO 里的 `lines` 是已解析的曲线配置。
 */

import type { ChartLine } from '../domain/models'

/** 图表配置（旧 `ChartDto`）。 */
export interface ChartDto {
  chartId: string
  ledgerId: string
  title: string
  /** year / month */
  granularity: string
  lines: ChartLine[]
  /** line / bar */
  chartType: string
  isPreset: boolean
  sortOrder: number
}

/** 新建图表（旧 `CreateChartRequest`；`isPreset` 恒为 false）。 */
export interface CreateChartRequest {
  ledgerId: string
  title: string
  granularity: string
  lines: ChartLine[]
  chartType: string
}

/** 更新图表（旧 `UpdateChartRequest`；整行回写，`isPreset` / `createdAt` 不变）。 */
export interface UpdateChartRequest {
  chartId: string
  title: string
  granularity: string
  lines: ChartLine[]
  chartType: string
  sortOrder: number
}

/** 拖拽排序后的落库参数（旧 `UpdateChartSortRequest`；只带 id 与序号，碰不到图表内容）。 */
export interface UpdateChartSortRequest {
  chartId: string
  sortOrder: number
}
