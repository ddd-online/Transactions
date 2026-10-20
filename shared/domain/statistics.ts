/**
 * 统计取数的**筛选条件**：`recent` 的取值规则、月份区间的归一化、统计口径与分组笔数。
 *
 * 从 `tr-ipc/src/commands/stock.rs:463-473` 搬来（候选 6 / #35）。搬的理由是那句注释与代码
 * **互相矛盾**，而只有代码是对的：
 *
 * ```text
 * // 空串按"没传"处理（保持宽松）；非数字串或 <= 0 一律报错
 * ```
 *
 * 实际行为（`query_number_as_i64` 把解析失败的文本都折成 `None`）：
 *
 * * 字段缺失 / `null` / 空串 / **非数字串** → 都按"没传"处理（不限）；
 * * 数字 `> 0` → 取该值；
 * * 数字 `<= 0` → 报错 `recent 必须为正整数`。
 *
 * 也就是说非数字串**不会**报错。这条差别在界面上看不出来（界面只送数字），但它是契约的一部分，
 * 所以这里逐条钉住，别再让注释与代码打架。
 *
 * 同一个类型后来还装进了**统计口径**（{@link StatisticsStrategy} 与 `groupSize`）：它不是
 * "筛掉哪些记录"，而是"把入选的记录切成哪些统计点"，所以 {@link isUnfiltered} 不看它 ——
 * 全量 + 分组依然是"没筛"。
 *
 * Rust 的 `Result<_, &'static str>` 在这里一律是"抛 `new Error(同一句文案)`"；
 * `Option<T>` 是 `T | null`。
 */

/** `recent <= 0` 时的错误文案（与 tr-ipc 的 `AppError::bad_request` 用同一句）。 */
export const RECENT_NOT_POSITIVE = 'recent 必须为正整数'

/** 月区间与"最近 N 笔"同时给时的错误文案（服务层原来硬编码这一句）。 */
export const RANGE_AND_RECENT = '时间范围与笔数筛选不能同时使用'

/** `strategy` 不是两个口径之一时的错误文案。 */
export const STRATEGY_INVALID = 'strategy 取值需为 cumulative（逐笔累计）或 grouped（分组统计）'

/** 分组口径下 `groupSize` 缺失或越界时的错误文案。 */
export const GROUP_SIZE_INVALID = 'group_size 需为 2 到 1000 的整数'

/**
 * 每组至少 2 笔：`1` 就是"每组一笔"，与逐笔累计的差别只剩"要不要组间累计"，
 * 摆两个选项却看不出区别，不如不收。
 */
export const GROUP_SIZE_MIN = 2

/**
 * 每组笔数上限（防手改请求塞一个 1e18 进来；界面上只提供 5 / 10 / 20 / 50）。
 */
export const GROUP_SIZE_MAX = 1000

/**
 * 统计口径：把筛选出来的结算切成哪些"统计点"。
 *
 * * `cumulative`（逐笔累计）：第 i 个点 = 集合里第 1..=i 笔的**累计**值，
 *   点的个数 = 集合里的结算笔数；
 * * `grouped`（分组统计）：第 k 个点 = 集合里第 (k−1)·N+1 ..= k·N 笔
 *   **本组自己**的值（不做组间累计，回撤在组内从 0 起步），点的个数 = ⌈笔数 ÷ N⌉。
 *
 * 这个类型只管**口径**，不管"哪些结算入选"（那是月区间 / 最近 N 笔 / 标签三件事），
 * 所以它不进 {@link isUnfiltered}。字符串取值即 wire 契约，不能改。
 */
export type StatisticsStrategy = 'cumulative' | 'grouped'

/** 两个口径（顺序即界面下拉里的顺序）。对应 Rust 的 `StatisticsStrategy::ALL`。 */
export const STATISTICS_STRATEGIES: readonly StatisticsStrategy[] = ['cumulative', 'grouped']

/** 默认口径：逐笔累计（字段缺省、空串都是它）。 */
export const DEFAULT_STATISTICS_STRATEGY: StatisticsStrategy = 'cumulative'

/** wire 上的取值（`StockStatisticsRequest::strategy`）；与字符串联合本身一致。 */
export function strategyWire(strategy: StatisticsStrategy): StatisticsStrategy {
  return strategy
}

/** 界面上的名字（下拉选项文案的唯一来源，界面按 {@link STATISTICS_STRATEGIES} 生成选项）。 */
export function strategyLabel(strategy: StatisticsStrategy): string {
  switch (strategy) {
    case 'cumulative':
      return '逐笔累计'
    case 'grouped':
      return '分组统计'
  }
}

/**
 * wire 文本 → 口径：**空串按"没传"处理**（默认逐笔累计），非空必须精确命中两个取值之一。
 *
 * 这里比 `recent` 严：那个字段的"非数字串按没传处理"是历史行为（见模块文档），
 * 口径写错却悄悄按逐笔累计算，用户看到的是"下拉选了分组、图上还是累计"。
 */
export function parseStrategyWire(raw: string): StatisticsStrategy {
  switch (raw) {
    case '':
    case 'cumulative':
      return 'cumulative'
    case 'grouped':
      return 'grouped'
    default:
      throw new Error(STRATEGY_INVALID)
  }
}

/** Rust `i64` 的上下界：解析超界的文本按"解析失败"处理。 */
const I64_MIN = -(2n ** 63n)
const I64_MAX = 2n ** 63n - 1n

/** Rust `i64::from_str` 认的写法：可选正负号 + ASCII 数字，不接受空白 / 小数点 / 下划线。 */
const INTEGER_TEXT = /^[+-]?[0-9]+$/

/**
 * 文本 → 数字那一半：**解析失败一律 `null`**（宽松，与既有行为逐字一致；不做 trim）。
 *
 * 超出 `i64` 范围也算解析失败。TS 的 `number` 超过 `Number.MAX_SAFE_INTEGER` 时会舍入，
 * 但调用方只用它判断"正数 / 不限"并取笔数，故按 Rust 的值域收下。
 */
export function parseRecentText(raw: string): number | null {
  if (!INTEGER_TEXT.test(raw)) return null
  const value = BigInt(raw)
  if (value < I64_MIN || value > I64_MAX) return null
  return Number(value)
}

/** 数字之后那一半：`null` = 不限，正整数 = 取该值，其余报错。 */
export function normalizeRecent(parsed: number | null): number | null {
  if (parsed === null) return null
  if (Number.isInteger(parsed) && parsed > 0) return parsed
  throw new Error(RECENT_NOT_POSITIVE)
}

/**
 * 月份区间的归一化：空串 = 不限；只填一端时另一端不限（半开）。
 *
 * 返回 `null` 表示这一端不限。
 */
export function normalizeMonth(raw: string): string | null {
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

/**
 * 一端筛选条件的三段（月份区间 / 最近 N 笔 / 标签）+ 统计口径。
 *
 * 筛选那三段今天以裸形参在界面 → IPC → 服务层之间传递，靠位置对齐；这个类型是它们
 * **同一份**的样子，也是"哪一端不限"的唯一判据。
 */
export interface StatisticsFilter {
  /** 起始月（`YYYY-MM`；空白 = 不限） */
  startMonth: string
  /** 结束月（`YYYY-MM`；空白 = 不限） */
  endMonth: string
  /** `> 0` 才算数；`null` 表示不限（这一步由 {@link normalizeRecent} 保证） */
  recent: number | null
  /** 标签筛选（空白 = 不限） */
  tag: string
  /** 统计口径（缺省 = 逐笔累计，见 {@link createStatisticsFilter}） */
  strategy: StatisticsStrategy
  /** 分组口径下每组的结算笔数；逐笔累计口径下**忽略**（{@link validateFilter} 只查分组） */
  groupSize: number | null
}

/** 从请求里的四段拼出一个筛选条件（`recent` 已经过 {@link normalizeRecent}），口径默认逐笔累计。 */
export function createStatisticsFilter(
  startMonth: string,
  endMonth: string,
  recent: number | null,
  tag: string,
): StatisticsFilter {
  return {
    startMonth,
    endMonth,
    recent,
    tag,
    strategy: DEFAULT_STATISTICS_STRATEGY,
    groupSize: null,
  }
}

/** Rust 的 `StatisticsFilter::default()`：两端 / 标签为空、不限额、逐笔累计、无组大小。 */
export function defaultStatisticsFilter(): StatisticsFilter {
  return createStatisticsFilter('', '', null, '')
}

/**
 * 设定统计口径（`size` 是分组口径下每组的笔数，逐笔累计口径下传 `null`）。
 *
 * 构造器不校验 `size`：越界（含"分组却没给笔数"）一律留给 {@link validateFilter}
 * 报 {@link GROUP_SIZE_INVALID} —— 规则只有一处。返回新对象，不改入参。
 */
export function withStrategy(
  filter: StatisticsFilter,
  strategy: StatisticsStrategy,
  size: number | null,
): StatisticsFilter {
  return { ...filter, strategy, groupSize: size }
}

/** 月份区间那一端（`null` = 不限）。对应 Rust 的 `StatisticsFilter::start`。 */
export function filterStart(filter: StatisticsFilter): string | null {
  return normalizeMonth(filter.startMonth)
}

/** 月份区间那一端（`null` = 不限）。对应 Rust 的 `StatisticsFilter::end`。 */
export function filterEnd(filter: StatisticsFilter): string | null {
  return normalizeMonth(filter.endMonth)
}

/** 标签筛选（`null` = 不限）。对应 Rust 的 `StatisticsFilter::tag_filter`。 */
export function filterTag(filter: StatisticsFilter): string | null {
  return normalizeMonth(filter.tag)
}

/** 是不是"什么都不筛"（全量）；统计口径不参与判断。对应 Rust 的 `is_unfiltered`。 */
export function isUnfiltered(filter: StatisticsFilter): boolean {
  return (
    filterStart(filter) === null &&
    filterEnd(filter) === null &&
    filter.recent === null &&
    filterTag(filter) === null
  )
}

/**
 * 筛选条件本身是否自洽（与数据库无关的那三条规则）。
 *
 * 从服务层 `get_statistics_range` 开头那两句搬来 —— 那条"月区间与最近 N 笔互斥"
 * 的口径从前只写在服务层的 `if` 里。
 *
 * 注意 `recent` 已是"归一化之后"的值（`null` = 不限），所以这里不处理 `recent == 0`；
 * 负数只在调用方绕过归一化时才会出现，保留判断以防万一（非整数同理，Rust 侧由 `i64` 保证）。
 * 校验顺序与 Rust 一致：`recent` 负数 → 区间与笔数互斥 → 分组笔数。
 */
export function validateFilter(filter: StatisticsFilter): void {
  if (filter.recent !== null && (!Number.isInteger(filter.recent) || filter.recent < 0)) {
    throw new Error(RECENT_NOT_POSITIVE)
  }
  if (filter.recent !== null && (filterStart(filter) !== null || filterEnd(filter) !== null)) {
    throw new Error(RANGE_AND_RECENT)
  }
  const size = filter.groupSize
  const sizeValid =
    size !== null &&
    Number.isInteger(size) &&
    size >= GROUP_SIZE_MIN &&
    size <= GROUP_SIZE_MAX
  if (filter.strategy === 'grouped' && !sizeValid) {
    throw new Error(GROUP_SIZE_INVALID)
  }
}
