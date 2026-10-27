/**
 * 连板天梯：涨停股池的条目形状与按日汇总后的天梯形状。
 *
 * 单位与全站一致：金额恒为整数**分**，价格恒为整数**厘**；
 * 涨跌幅 / 换手率 / 晋级率都是**百分数**（`12.34` 表示 12.34%），与统计页口径相同。
 *
 * 这一份数据是**市场数据**，不属于任何账本：库表按交易日存，不挂 `ledger_id`。
 */

/** 涨停股池里的一只股票（某个交易日）。 */
export interface StockLimitEntry {
  /** 六位代码（北交所 `92xxxx` 也在池内） */
  stockCode: string
  stockName: string
  /** 东财市场号：0 深 / 1 沪 / 2 北 */
  market: number
  /** 收盘价（厘） */
  priceMilli: number
  /** 涨跌幅（百分数） */
  pct: number
  /** 成交额（分） */
  amountCents: number
  /** 流通市值（分） */
  floatMvCents: number
  /** 换手率（百分数） */
  turnover: number
  /** 连板数（`1` = 首板） */
  level: number
  /** 首次封板时间 `HHMMSS` */
  firstSeal: number
  /** 最后封板时间 `HHMMSS` */
  lastSeal: number
  /** 炸板次数 */
  brokenCount: number
  /** 封单额（分） */
  sealFundCents: number
  /** 所属行业（东财原文，可能截断） */
  industry: string
  /** N 天 M 板里的 N */
  statDays: number
  /** N 天 M 板里的 M */
  statCount: number
}

/** 天梯的一层（一个板数）。 */
export interface StockLimitRung {
  level: number
  /** 今日仍在该板数上的股票 */
  entries: StockLimitEntry[]
  /**
   * 断板：昨日在这一层、今日未涨停的股票，排在 `entries` 后面展示。
   * 该层可能只有断板（今日无人晋级），此时 `entries` 为空。
   */
  broken: StockLimitEntry[]
  /** 昨日 (level-1) 板的家数；首板没有候选，为 `null` */
  candidates: number | null
  /** 该层晋级率（百分数）；无候选或昨日缺失为 `null` */
  rate: number | null
}

/** 天梯顶部的汇总数字；`null` 一律表示"前一交易日缺失，算不出"。 */
export interface StockLimitMetrics {
  /** 今日涨停家数 */
  limitCount: number
  /** 昨日涨停家数 */
  previousCount: number | null
  /** 今日最高板；没有涨停为 `null` */
  maxLevel: number | null
  /** 昨日涨停今日继续涨停的家数 */
  promotedCount: number | null
  /** 整体晋级率（百分数） */
  rate: number | null
  /** 断板家数 */
  brokenCount: number | null
}

/**
 * `ok` 有涨停数据；`empty` 该日无涨停（非交易日，或收盘后确实一只都没有）；
 * `preopen` 当天 09:30 之前：还没有当天数据可看，也不会抓取；
 * `unavailable` 本地没有、数据源也没收录（早于数据源的保留窗口）。
 */
export type StockLimitStatus = 'ok' | 'empty' | 'preopen' | 'unavailable'

/** 某一天的天梯（一次查询的完整结果）。 */
export interface StockLimitLadder {
  /** `YYYY-MM-DD` */
  date: string
  /** 前一个交易日的 `YYYY-MM-DD`；找不到为 `null` */
  previousDate: string | null
  status: StockLimitStatus
  /**
   * 盘中临时快照：当日 15:00 收盘前抓的数据，**不写库**。
   * 界面据此提示"收盘后才定稿"。
   */
  temporary: boolean
  /** 这份数据直接读自本地库（没有发请求） */
  fromCache: boolean
  /** 刷新失败、退回本地缓存时为 `true` */
  stale: boolean
  /** 这份数据抓取（或从库里读出）的时间，Unix 秒 */
  fetchedAt: number
  source: 'eastmoney'
  /**
   * 天梯各层，按板数**升序**（首板在左，最高板在右）。
   * 层数取"今日 ∪ 昨日"：昨日的高板今天断了，那一层也要留下，断板就挂在里面。
   */
  rungs: StockLimitRung[]
  metrics: StockLimitMetrics
}
