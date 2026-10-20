/**
 * 股票统计（逐笔结算统计）的 DTO 形状。
 *
 * 对应旧版 `tr-domain/src/dto/stock.rs` 的 `StockStatisticsDto` /
 * `StockStatisticsPointDto`。字段名是 **wire 契约**（Rust 侧 serde rename 成 camelCase），
 * 单位口径与旧版逐字一致：
 *
 * * 金额恒为整数**分**；
 * * 百分比是「百分数」（`66.67` 表示 66.67%）；比率是倍数（`1.2`）；
 * * `pnlRatio` 在尚无亏损样本时是 `null`（不是 0 —— 界面显示占位符）。
 */

/**
 * 一个结算统计点。
 *
 * 逐笔累计口径下：第 i 个点 = 第 1..=i 笔的累计值，`span === sequence`；
 * 分组口径下：`span` 是该组笔数，`totalPnl` / 胜率 / 平均盈亏 / 回撤都是**本组**的，
 * 身份字段（`pnl` / `pnlRate` / 日期 / 股票 / 标签）取组末那笔。
 */
export interface StockStatisticsPointDto {
  /** 集合内的结算序号（第 N 笔；筛选后从 1 重新编号） */
  sequence: number
  /** 本点覆盖的结算笔数（逐笔累计 = sequence；分组 = 该组笔数） */
  span: number
  /** 本统计点的**建仓时间**（Unix 秒）—— 统计页的时间轴 */
  openedAt: number
  /** 本统计点的清仓时间（Unix 秒）；只用于展示，不决定顺序 */
  closedAt: number
  stockCode: string
  stockName: string
  /** 该股第几轮 */
  stockRoundNo: number
  tag: string
  /** 本笔盈亏（分） */
  pnl: number
  /** 本笔盈亏率（%） */
  pnlRate: number
  /** 本笔包含的成交笔数 */
  tradeCount: number
  /** 累计盈亏（分） */
  totalPnl: number
  winCount: number
  lossCount: number
  /** 胜率（%） */
  winRate: number
  /** 平均盈利（分） */
  avgWin: number
  /** 平均亏损（分，正数） */
  avgLoss: number
  /** 盈亏比（平均盈利 ÷ 平均亏损）；尚无亏损样本时为 `null` */
  pnlRatio: number | null
  /** 期望值（分 / 笔） */
  expectancy: number
  /** 最大回撤（分） */
  maxDrawdown: number
  /** 最大回撤占当时本金比例（%） */
  maxDrawdownPct: number
}

/** 交易统计总览：本金 + 逐笔结算统计点 + 分组口径的统计点。 */
export interface StockStatisticsDto {
  /** 当前本金（分） */
  principal: number
  /** 已结算笔数（筛选后） */
  roundCount: number
  /** 逐笔累计 / 区间累计的统计点（无结算时为空） */
  points: StockStatisticsPointDto[]
  /** 分组口径的统计点；逐笔累计口径下为空 */
  groups: StockStatisticsPointDto[]
}
