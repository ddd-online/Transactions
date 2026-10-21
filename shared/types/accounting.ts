/** 记账 · 看板（既有 `DTO accounting_overview.rs`，响应 camelCase）。 */

export interface AccountingOverviewRequest {
  ledgerId: string
  /** month / year（其它值按 month） */
  periodKind: string
  /** "2026-10" / "2026"；空串 = 当期 */
  periodKey: string
}

export interface OverviewPeriodDto {
  kind: string
  key: string
  label: string
  isCurrent: boolean
  /** 月视图走到第几天；已走完 / 年视图为 null */
  throughDay: number | null
  year: number
}

export interface OverviewCardsDto {
  expense: number | null
  income: number | null
  balance: number | null
}

export interface OverviewSliceDto {
  label: string
  amount: number
  count: number
  isOther: boolean
}

export interface AccountingOverviewDto {
  period: OverviewPeriodDto
  cards: OverviewCardsDto
  categories: OverviewSliceDto[]
}
