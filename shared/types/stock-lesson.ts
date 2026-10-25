/** 股票「心得」：一句话总结，可关联到某一轮已清仓交易。 */
export interface StockLessonDto {
  id: string
  /** 一句话心得（已去掉首尾空白） */
  text: string
  /** 关联的交易轮次；未关联为 null */
  roundId: string | null
  /** 来源快照：即使轮次被回滚/删除，也还知道它来自哪只股票、哪一轮 */
  stockCode: string
  stockName: string
  roundNo: number
  openedAt: number
  closedAt: number
  /** 快照盈亏（分）；轮次仍存在时按实时交易重算 */
  pnl: number
  /** 快照盈亏率（%） */
  pnlRate: number
  /** 关联轮次当前是否还在库里；false 时跳转禁用 */
  sourceAvailable: boolean
  createdAt: number
  updatedAt: number
}

/** 心得弹窗里的可关联轮次选项。 */
export interface StockRoundOptionDto {
  roundId: string
  stockCode: string
  stockName: string
  roundNo: number
  openedAt: number
  closedAt: number
  pnl: number
  pnlRate: number
}
