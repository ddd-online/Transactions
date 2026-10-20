/**
 * 折线图的纯算法：坐标、刻度、路径、填充与提示框定位。
 *
 * 从 `crates/tr-draw/src/chart.rs` 逐条搬来。本模块不认识 DOM，也不认识图表库：
 * 输入是 `number` / `string` / 本模块自己的类型，输出是数值、路径字符串或改写过的 SVG 文本。
 * 渲染侧负责把 DOM 测量值喂进来、把结果画出去。
 *
 * 移植约定：Rust 的 `Option<T>` 是 `T | null`；元组是只读定长数组；`impl Fn(&str) ->
 * Option<String>` 是 `(tag: string) => string | null`；Rust 的 `f64::EPSILON` 就是
 * `Number.EPSILON`。Rust 里返回 `f32` 的地方（{@link displayValue}、{@link niceAxisRange}
 * 的 f32 比较）用 `Math.fround` 逐位对齐 —— JS 只有 f64，不收敛就会改变"上界是否算严格大于
 * 数据"这类判据。
 *
 * `ChartGeometry` 的固有方法搬成了同目录下的纯函数：`assemble` → {@link assembleGeometry}，
 * `y_of` / `y_range` / `x_extent` / `points_at` / `rows_at` → {@link yOf} / {@link yRange} /
 * {@link xExtent} / {@link pointsAt} / {@link rowsAt}；默认值用 {@link chartGeometry}。
 */

/** 一条序列。 */
export interface ChartSeries {
  /** 图例文案 */
  readonly label: string
  /** CSS 变量名或任意合法颜色值（推荐 `var(--transactions-color-*)`） */
  readonly color: string
  /**
   * 与 X 轴类目一一对应的取值（长度不足的类目按 0 处理）。
   *
   * **金额仍是"分"**（由 {@link ChartValueKind} 的 `Money` 换算成元）；用 `number`（f64）
   * 是因为比值、百分比这类指标本来就是小数，取整会把 0.81 变成 1（见 `Ratio`）。
   */
  readonly data: readonly number[]
}

/** 构造一条序列（对应 Rust 的 `ChartSeries::new`）。 */
export function chartSeries(
  label: string,
  color: string,
  data: readonly number[],
): ChartSeries {
  return { label, color, data }
}

/** Y 轴取值语义（决定刻度与 tooltip 的格式化）。 */
export const ChartValueKind = {
  /** 金额：分 → 元；刻度千分位、tooltip 两位小数带 `¥` */
  Money: 'money',
  /** 百分比：已是百分数（`12.5` → `12.50%`） */
  Percent: 'percent',
  /** 比值/倍数：两位小数（`0.81` → `0.81`） */
  Ratio: 'ratio',
  /** 计数：整数 */
  Count: 'count',
} as const

export type ChartValueKind = (typeof ChartValueKind)[keyof typeof ChartValueKind]

/** 默认取值语义（对应 Rust `#[default] Money`）。 */
export const DEFAULT_CHART_VALUE_KIND: ChartValueKind = ChartValueKind.Money

/** 拿不到容器尺寸时的兜底宽度 */
export const FALLBACK_WIDTH = 720

/** X 轴标签最小间距（px，按渲染像素算） */
const X_LABEL_MIN_GAP = 56

/**
 * Y 轴分段数（段数 + 1 = 刻度条数）。**只在算不出"大整数"范围时兜底**，
 * 正常路径由 {@link niceAxisRange} 给出段数（见那里的注释）。
 */
export const Y_SPLITS = 4

/** Y 轴最多分几段（= 最多 6 条刻度）。再密就压过折线本身了。 */
export const Y_AXIS_MAX_SPLITS = 5

/**
 * 上界贴着数据时抬起的微量（只为过图表库的"`axis_max` 必须严格大于数据"那一关；
 * 刻度按一位小数格式化，0.01 不会出现在刻度文字里）。
 */
const AXIS_LIMIT_EPSILON = 0.01

/** 刻度与类目标签的字号（px）。标签抽稀按它估文字宽度。 */
export const TICK_FONT_PX = 12

/** 图表内边距 */
export const MARGIN = 8

/** Y 轴文案区预留宽度（抽稀时估算可用绘图宽度用） */
const Y_LABEL_AREA = 56

/** tooltip 与指针之间留的空隙（px，浮层不盖住光标）。导出只为让单测钉住契约。 */
export const TOOLTIP_GAP = 14

/** 量不到 tooltip 实际宽度时的兜底估算（首帧用；CSS 的 `min-width` 是 160，加上两侧内边距） */
export const TOOLTIP_FALLBACK_WIDTH = 200

/**
 * tooltip 相对画布的落点（纯计算，便于单测）。
 *
 * 语义：**跟着鼠标** —— 以指针为基准，但收在画布内：
 * * 左右贴边时不再居中，`transform` 由 `-50%` 换成 `0` / `-100%`（浮层完整可见）；
 * * 上方放不下（画布顶边）就翻到指针下方。
 */
export interface TooltipPlacement {
  /** 浮层左边缘（px，相对画布） */
  readonly left: number
  /** 浮层上边缘（px，相对画布） */
  readonly top: number
  /** `translateX` 的百分比（0 / 50 / 100，配合负号） */
  readonly translateX: number
  /** `translateY` 的百分比（`-100` = 浮层整体位于 `top` 之上，`0` = 位于其下） */
  readonly translateY: number
}

/** 内联样式串（对应 Rust 的 `TooltipPlacement::style`，界面里直接用）。 */
export function tooltipStyle(placement: TooltipPlacement): string {
  return (
    `left: ${placement.left.toFixed(1)}px; top: ${placement.top.toFixed(1)}px; ` +
    `transform: translateX(-${placement.translateX.toFixed(0)}%) ` +
    `translateY(${placement.translateY.toFixed(0)}%);`
  )
}

/** 按"指针位置 + 画布尺寸 + 浮层尺寸"算落点。 */
export function placeTooltip(
  cursor: readonly [x: number, y: number],
  canvasWidth: number,
  tooltipWidth: number,
  tooltipHeight: number,
): TooltipPlacement {
  const [cursorX, cursorY] = cursor
  const width = tooltipWidth > 0 ? tooltipWidth : TOOLTIP_FALLBACK_WIDTH
  const half = width / 2

  // 水平：能居中就居中，贴边则夹住（`translateX` 随之从 50 变 0 / 100）
  let left: number
  let translateX: number
  if (canvasWidth <= width) {
    // 画布比浮层还窄：居中即可，没有可挪的余地
    left = canvasWidth / 2
    translateX = 50
  } else if (cursorX - half < 0) {
    left = 0
    translateX = 0
  } else if (cursorX + half > canvasWidth) {
    left = canvasWidth
    translateX = 100
  } else {
    left = cursorX
    translateX = 50
  }

  // 垂直：默认在指针上方，画布顶部放不下就翻到下方
  let top: number
  let translateY: number
  if (cursorY - tooltipHeight < TOOLTIP_GAP) {
    top = cursorY + TOOLTIP_GAP
    translateY = 0
  } else {
    top = cursorY - TOOLTIP_GAP
    translateY = -100
  }

  return { left, top, translateX, translateY }
}

// ==================================================================== 组件

/**
 * 面积填充 path 的判据：**只有它带 `fill-opacity`**（折线是 `fill="none" stroke="…"`，
 * 数据点是 `<circle>`，背景是 `<rect>`）。
 */
const FILL_OPACITY_ATTR = 'fill-opacity'

/** SVG path 元素的起始标记 */
const SVG_PATH_OPEN = '<path '

/** SVG 里"没有填充"的写法（折线 path 用它；填充 path 用的是具体颜色） */
const FILL_NONE_ATTR = 'fill="none"'

/**
 * 把面积填充的基线从"绘图区底边"挪到 **0 轴**。
 *
 * 图表库的 `StraightLineFill` 只会把折线闭到绘图区底边，于是数据**既有正又有负**时，
 * 负的那一段会被填成"从折线一路铺到图底"的大色块 —— 看着像一路亏到底，读不出"亏了多少 /
 * 又涨回来多少"。记账图里"面积"的语义是**相对 0 的盈亏**，基线必须落在 0 轴上：正的往上长、
 * 负的往下长。
 *
 * 组件没暴露这个基线，所以在生成好的 SVG 上做一次**定点改写**。填充 path 的形状是固定的
 * "折线各点 + 三个收尾点"（`L (last.x, bottom) L (first.x, bottom) L first`），把其中
 * **前两个**收尾点的 y 换成 0 轴的 y 即可。跨零的那一段不用特殊处理：多边形自己按 nonzero
 * 规则填充，结果就是标准的"以 0 为基线"的面积图。
 *
 * 0 轴的 y 由几何反推：`y = H × (1 − (v − min) / (max − min))`（H 为绘图区高度），而填充的
 * 基线 y 正是 `margin.top + H`，所以 `y(0) = bottom + (bottom − margin.top) × min / (max − min)`。
 * `margin.top` 就是 {@link MARGIN}，且绘图区顶边确实落在它上面 —— 本组件始终把图表的标题 /
 * 副标题置空、自带图例关闭（图例是自绘 HTML），它不会再往顶部塞东西。
 *
 * 只在**我们自己的范围真的生效**（`axisRange` 有值）且算出的 0 轴落在绘图区内时才改写；
 * 否则原样返回（宁可保持现状，也不画一条位置错的基线）。
 */
export function anchorFillAtZero(
  svg: string,
  axisRange: AxisRange | null,
): string {
  if (axisRange === null) return svg
  const [min, max] = axisRange
  // 同 {@link zeroAxisY}：严格 `max > min` 才算数（NaN / 相等都不改写）。
  if (!(max > min)) return svg
  return rewriteTags(svg, SVG_PATH_OPEN, (tag) => rewriteFillBaseline(tag, min, max))
}

/**
 * 逐个替换 SVG 里以 `open` 开头的自闭合标签（`…/>`）；`f` 返回 `null` 的标签原样保留。
 *
 * 三处定点改写（填充基线 / 实心点 / 按 0 轴分色）共用这一套扫描：只认 `<path `/`<circle`
 * 这样的起始标记，标签之间的字节（网格线、文字、缩进）原样搬过去。
 */
export function rewriteTags(
  svg: string,
  open: string,
  f: (tag: string) => string | null,
): string {
  let out = ''
  let rest = svg
  for (;;) {
    const start = rest.indexOf(open)
    if (start < 0) break
    out += rest.slice(0, start)
    const tail = rest.slice(start)
    const end = tail.indexOf('/>')
    if (end < 0) {
      out += tail
      return out
    }
    const tag = tail.slice(0, end + 2)
    out += f(tag) ?? tag
    rest = tail.slice(end + 2)
  }
  out += rest
  return out
}

/**
 * 数据点改成**实心**：给出每个序列的色号（`#RRGGBB` 或带 alpha 的 `#RRGGBBAA`）。
 *
 * 图表库的 `Symbol::Circle(r, None)` 表示"不填充"（渲染出来是空心环），而它只提供
 * "整个图表一个 symbol"的开关、没法逐序列指定填充色。所以在 SVG 串里按 `<circle>` 标签
 * 做定向替换：`stroke="#该序列色" fill="none"` → `fill="#该序列色"`。
 *
 * **必须逐标签处理**：折线路径同样是 `stroke="#色" fill="none"`，整串替换会把折线
 * 填成一整块面积（`solid_dots_only_touches_circles` 锁的就是这条）。
 *
 * 色号由界面侧给（图表库的 `Color` 只有渲染侧认识，本模块不许依赖它）。
 */
export function solidDots(svg: string, hexes: readonly string[]): string {
  return rewriteTags(svg, '<circle', (tag) => {
    let next = tag
    for (const hex of hexes) {
      const ring = `stroke="${hex}" fill="none"`
      if (next.includes(ring)) {
        next = next.split(ring).join(`stroke="${hex}" fill="${hex}"`)
      }
    }
    return next
  })
}

/** `<text …>` 的起始标记（刻度文字都长这样） */
const SVG_TEXT_OPEN = '<text'

/** 文本节点的结束标记 */
const SVG_TEXT_CLOSE = '</text>'

/**
 * 给 **Y 轴负刻度**补上千分位分隔符。
 *
 * 图表库的 `{t}` 只给正数分组：`thousands_format_float` 第一行是
 * `if value < 1000.0 { return format_float(value) }`，**负数全落进这条分支**，于是跨零的图上
 * 会同时出现 `50,000` 与 `-50000`（用户报的缺陷）。它只给了 `axis_formatter` 这个**模板字符串**
 * 口子（只做 `{c}` / `{t}` 的字面替换，没有"自定义格式化函数"），所以照本模块的惯例在它生成的
 * SVG 上做一次定点改写（同 {@link anchorFillAtZero} / {@link solidDots}）。
 *
 * 改写范围只有「负号 + ≥ 4 位数字（后面允许跟不含数字的后缀，如百分比轴的 `%`）」的**文本内容**：
 * 正数、`-500` 这种本来就不该分组的、以及类目轴上的 `2026-01` 都原样保留；
 * 文字写在两行里的形式（`<text …>\n-50000\n</text>`）也照改，前后换行与所有属性一个字节不动。
 *
 * 轴宽不用跟着改：图表库的预留宽度是按改写前的最长标签量的，而文字是**左边缘**定死在 `x` 上的，
 * 多出来的那个逗号往右长进 `name_gap` 那 8px 里，既不会被 SVG 边界裁掉、也不会压到绘图区
 * （实测探针：`-100000` 的 `x = 4`，补一个逗号后右边缘距绘图区还有约 1px）。
 */
export function groupNegativeTickLabels(svg: string): string {
  let out = ''
  let rest = svg
  for (;;) {
    const start = rest.indexOf(SVG_TEXT_OPEN)
    if (start < 0) break
    out += rest.slice(0, start)
    // 认不出成对的 `<text …>…</text>` 就整段照搬（宁可不动，也不改坏）
    const tail = rest.slice(start)
    const openEnd = tail.indexOf('>')
    if (openEnd < 0) {
      out += tail
      return out
    }
    const contentStart = openEnd + 1
    const close = tail.indexOf(SVG_TEXT_CLOSE, contentStart)
    if (close < 0) {
      out += tail
      return out
    }
    out += tail.slice(0, contentStart)
    const content = tail.slice(contentStart, close)
    out += groupNegativeNumber(content) ?? content
    out += SVG_TEXT_CLOSE
    rest = tail.slice(close + SVG_TEXT_CLOSE.length)
  }
  out += rest
  return out
}

/**
 * 文本节点内容 → 补上千分位后的内容；不是「负号 + ≥ 4 位数字（+ 不含数字的后缀）」时返回 `null`。
 *
 * 首尾空白（图表库把文字写在标签的下一行）原样保留。
 */
function groupNegativeNumber(content: string): string | null {
  const trimmed = content.trim()
  if (!trimmed.startsWith('-')) return null
  const digitsAndSuffix = trimmed.slice(1)
  let digitsEnd = digitsAndSuffix.length
  for (let index = 0; index < digitsAndSuffix.length; index += 1) {
    const code = digitsAndSuffix.charCodeAt(index)
    if (code < 0x30 || code > 0x39) {
      digitsEnd = index
      break
    }
  }
  const digits = digitsAndSuffix.slice(0, digitsEnd)
  const suffix = digitsAndSuffix.slice(digitsEnd)
  // 后缀里出现数字就不是一个纯数值刻度（如类目 `-2026-01`），不乱改
  if (digits.length < 4 || /[0-9]/.test(suffix)) return null
  const offset = digits.length % 3
  let grouped = '-'
  for (let index = 0; index < digits.length; index += 1) {
    if (index !== 0 && index % 3 === offset) grouped += ','
    grouped += digits[index]
  }
  grouped += suffix
  const leading = content.slice(0, content.length - content.trimStart().length)
  const trailing = content.slice(content.trimEnd().length)
  return `${leading}${grouped}${trailing}`
}

/** 一个二维点 `(x, y)`。 */
type Point = readonly [x: number, y: number]

/**
 * 0 轴的 y 像素：由填充 path 的**收尾基线**（绘图区底边）与 Y 轴范围反推。
 *
 * 填充 path 的形状是"折线各点 + 三个收尾点"，倒数第三个点的 y 就是绘图区底边。
 * 算不出高度、或 0 落在绘图区外时返回 `null`（几何假设不成立就别画）。
 */
function zeroAxisY(points: readonly Point[], min: number, max: number): number | null {
  // 只认严格 `max > min`：NaN 与相等都不成立（写成显式的"不大于"是为了让
  // "NaN 也不想画"这条意图清楚）。
  if (!(max > min) || points.length < 4) return null
  const bottom = points[points.length - 3][1]
  const height = bottom - MARGIN
  if (!(height > 0)) return null
  const zero = bottom + (height * min) / (max - min)
  if (!Number.isFinite(zero) || zero < MARGIN - 0.5 || zero > bottom + 0.5) return null
  return zero
}

/**
 * 把一条填充 path 的收尾基线挪到 0 轴；不是填充 path（或结构不是预期的那三个收尾点）时返回
 * `null`，调用方保持原样。
 */
function rewriteFillBaseline(tag: string, min: number, max: number): string | null {
  if (!tag.includes(FILL_OPACITY_ATTR)) return null
  const d = attrValue(tag, 'd')
  if (d === null) return null
  const points = pathPoints(d)
  if (points === null) return null
  const zero = zeroAxisY(points, min, max)
  if (zero === null) return null

  const parts: string[] = []
  for (let index = 0; index < points.length; index += 1) {
    const [x, y] = points[index]
    const action = index === 0 ? 'M' : 'L'
    let nextY = y
    if (index + 3 >= points.length) {
      // 最后三个点：前两个是基线端点，第三个回到首点（保持原样）
      if (index !== points.length - 1) nextY = zero
    }
    parts.push(`${action} ${fmtCoord(x)} ${fmtCoord(nextY)}`)
  }
  return replaceAttr(tag, 'd', parts.join(' '))
}

/**
 * 解析填充 path（只有 `M`/`L`，每个命令后面固定一个 x,y 对）。
 *
 * 只接受**单段**路径：图表库只在数据里有空洞时才会拆成多段（多个 `M`），
 * 那时"最后三个点"就不再是收尾基线了，宁可放弃改写也不要改错。
 */
function pathPoints(d: string): Point[] | null {
  if (countOccurrences(d, 'M ') !== 1) return null
  const numbers: number[] = []
  for (const token of d.split(/\s+/).filter((part) => part.length > 0)) {
    if (token === 'M' || token === 'L') continue
    const value = Number(token)
    if (Number.isNaN(value)) return null
    numbers.push(value)
  }
  if (numbers.length % 2 !== 0) return null
  const points: Point[] = []
  for (let index = 0; index < numbers.length; index += 2) {
    points.push([numbers[index], numbers[index + 1]])
  }
  // 只有"每个命令恰好一个坐标对"的写法才能这样配对，`H`/`V`/`C` 之类必须放弃改写
  const commands = countOccurrences(d, 'M ') + countOccurrences(d, 'L ')
  if (commands !== points.length) return null
  return points
}

/** 统计 `needle` 在 `haystack` 里出现的次数（对应 Rust `str::matches`）。 */
function countOccurrences(haystack: string, needle: string): number {
  let count = 0
  let index = haystack.indexOf(needle)
  while (index >= 0) {
    count += 1
    index = haystack.indexOf(needle, index + needle.length)
  }
  return count
}

/** 图表库写坐标的格式（一位小数，`.0` 去掉） */
function fmtCoord(value: number): string {
  const text = value.toFixed(1)
  return text.endsWith('.0') ? text.slice(0, -2) : text
}

/** 取 SVG 元素里某个属性的值（`name="…"`） */
function attrValue(element: string, name: string): string | null {
  const key = `${name}="`
  const start = element.indexOf(key)
  if (start < 0) return null
  const valueStart = start + key.length
  const end = element.indexOf('"', valueStart)
  if (end < 0) return null
  return element.slice(valueStart, end)
}

/** 替换 SVG 元素里某个属性的值，其余字节原样保留 */
function replaceAttr(element: string, name: string, value: string): string | null {
  const key = `${name}="`
  const start = element.indexOf(key)
  if (start < 0) return null
  const valueStart = start + key.length
  const valueEnd = element.indexOf('"', valueStart)
  if (valueEnd < 0) return null
  return element.slice(0, valueStart) + value + element.slice(valueEnd)
}

/** 一段折线：`(点集, 是否在 0 轴之上)`。 */
interface ZeroRun {
  readonly points: Point[]
  readonly above: boolean
}

/**
 * 折线按 0 轴切成若干**连续段**：`(点集, 是否在 0 轴之上)`。
 *
 * 相邻两点的 y 跨过 0 轴时插入**交点**（两段各收一个），段与段首尾相接 —— 于是每段都能
 * 单独闭合成"以 0 轴为底"的多边形，颜色可以按符号分开（红涨绿跌）。
 */
function splitAtZero(points: readonly Point[], zero: number): ZeroRun[] {
  // SVG 里 y 越小越靠上：`y <= 0 轴` 就是"在 0 轴之上"
  const above = (point: Point): boolean => point[1] <= zero
  const runs: ZeroRun[] = []
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index]
    if (index === 0) {
      runs.push({ points: [point], above: above(point) })
      continue
    }
    const previous = points[index - 1]
    if (above(previous) === above(point)) {
      runs[runs.length - 1].points.push(point)
      continue
    }
    const span = point[1] - previous[1]
    const ratio = Math.abs(span) < Number.EPSILON ? 0 : (zero - previous[1]) / span
    const crossing: Point = [previous[0] + ratio * (point[0] - previous[0]), zero]
    runs[runs.length - 1].points.push(crossing)
    runs.push({ points: [crossing, point], above: above(point) })
  }
  return runs
}

/** 折线 path 的 `d`（`M x y L x y …`，与图表库的写法一致） */
function polylineD(points: readonly Point[]): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${fmtCoord(point[0])} ${fmtCoord(point[1])}`,
    )
    .join(' ')
}

/** 一段折线闭合成"以 0 轴为底"的多边形（单点、竖直段没有面积，返回 `null`） */
function fillD(run: readonly Point[], zero: number): string | null {
  if (run.length < 2) return null
  const first = run[0]
  const last = run[run.length - 1]
  if (Math.abs(last[0] - first[0]) < Number.EPSILON) return null
  let d = polylineD(run)
  // 收尾沿 0 轴折回起点；末点已经落在 0 轴上时不必多画一条重复的边
  if (Math.abs(last[1] - zero) > Number.EPSILON) {
    d += ` L ${fmtCoord(last[0])} ${fmtCoord(zero)}`
  }
  d += ` L ${fmtCoord(first[0])} ${fmtCoord(zero)}`
  return d
}

/** 面积填充按 0 轴拆成多条 path，各自换成对应侧的颜色（`fill-opacity` 等属性原样保留）。 */
function splitFill(tag: string, zero: number, above: string, below: string): string | null {
  const d = attrValue(tag, 'd')
  if (d === null) return null
  const points = pathPoints(d)
  if (points === null || points.length < 3) return null
  // 最后三个点是图表库的收尾基线（见 {@link rewriteFillBaseline}），只取折线本身
  const line = points.slice(0, points.length - 3)
  let out = ''
  for (const run of splitAtZero(line, zero)) {
    const shape = fillD(run.points, zero)
    if (shape === null) continue
    const colored = replaceAttr(tag, 'd', shape)
    if (colored === null) return null
    const painted = replaceAttr(colored, 'fill', sideColor(run.above, above, below))
    if (painted === null) return null
    out += painted
  }
  return out.length === 0 ? null : out
}

/** 折线按 0 轴拆成多条 path，各自换成对应侧的颜色（颜色与面积、数据点一致）。 */
function splitLine(tag: string, zero: number, above: string, below: string): string | null {
  const d = attrValue(tag, 'd')
  if (d === null) return null
  const points = pathPoints(d)
  if (points === null) return null
  let out = ''
  for (const run of splitAtZero(points, zero)) {
    const colored = replaceAttr(tag, 'd', polylineD(run.points))
    if (colored === null) return null
    const painted = replaceAttr(colored, 'stroke', sideColor(run.above, above, below))
    if (painted === null) return null
    out += painted
  }
  return out.length === 0 ? null : out
}

/** 数据点按圆心相对 0 轴的位置着色（`stroke` 与 `fill` 一起换，边框与实心色一致）。 */
function signDot(tag: string, zero: number, above: string, below: string): string | null {
  const cyText = attrValue(tag, 'cy')
  if (cyText === null) return null
  const cy = Number(cyText)
  if (Number.isNaN(cy) || cyText.trim() === '') return null
  const color = sideColor(cy <= zero, above, below)
  const colored = replaceAttr(tag, 'stroke', color)
  if (colored === null) return null
  return replaceAttr(colored, 'fill', color)
}

/** 取"0 轴之上 / 之下"对应的颜色。 */
function sideColor(above: boolean, up: string, down: string): string {
  return above ? up : down
}

/** 找出填充 path 的标签文本（判据见 {@link FILL_OPACITY_ATTR}）。 */
function fillTag(svg: string): string | null {
  const parts = svg.split(SVG_PATH_OPEN)
  for (let index = 1; index < parts.length; index += 1) {
    const tail = parts[index]
    const end = tail.indexOf('/>')
    if (end < 0) continue
    const tag = tail.slice(0, end + 2)
    if (tag.includes(FILL_OPACITY_ATTR)) return tag
  }
  return null
}

/**
 * 面积 / 折线 / 数据点按 0 轴分色（红涨绿跌：之上红、之下绿）。
 *
 * 只在自己算出的范围有效、且 0 轴确实落在绘图区内时改写（同 {@link anchorFillAtZero}）；
 * 算不出 0 轴就原样返回 —— 宁可保持单色，也不画一条位置错的分界线。
 */
export function paintBySign(
  svg: string,
  axisRange: AxisRange | null,
  above: string,
  below: string,
): string {
  if (axisRange === null) return svg
  const [min, max] = axisRange
  const tag = fillTag(svg)
  if (tag === null) return svg
  const d = attrValue(tag, 'd')
  if (d === null) return svg
  const points = pathPoints(d)
  if (points === null) return svg
  const zero = zeroAxisY(points, min, max)
  if (zero === null) return svg
  const painted = rewriteTags(svg, SVG_PATH_OPEN, (candidate) => {
    if (candidate.includes(FILL_OPACITY_ATTR)) return splitFill(candidate, zero, above, below)
    if (candidate.includes(FILL_NONE_ATTR)) return splitLine(candidate, zero, above, below)
    return null
  })
  return rewriteTags(painted, '<circle', (candidate) => signDot(candidate, zero, above, below))
}

/**
 * 按可用宽度抽稀 X 轴类目标签（首尾必显）：不要的类目传空串，图表库不画空标签。
 *
 * `count === 0` 返回空数组（Rust 版在 `count - 1` 上会先 panic，这里按"没有类目"处理）。
 */
export function thinLabels(categories: readonly string[], width: number): string[] {
  const count = categories.length
  if (count === 0) return []
  const usable = Math.max(width - 2 * MARGIN - Y_LABEL_AREA, 48)
  let widest = 0
  for (const label of categories) {
    widest = Math.max(widest, estimatedLabelWidth(label, TICK_FONT_PX))
  }
  const minGap = Math.max(X_LABEL_MIN_GAP, widest + 12)
  const maxLabels = Math.max(Math.floor(usable / minGap), 1)
  const stride = Math.max(count > maxLabels ? Math.ceil(count / maxLabels) : 1, 1)

  const keep: number[] = []
  for (let index = 0; index < count; index += 1) {
    if (index % stride === 0) keep.push(index)
  }
  if (keep[keep.length - 1] !== count - 1) keep.push(count - 1)
  // 补上的最后一个若与前一个太近，就去掉前一个（否则两个标签会叠着画）
  if (keep.length >= 2) {
    const step = usable / (Math.max(count, 2) - 1)
    const last = keep[keep.length - 1]
    const previous = keep[keep.length - 2]
    if ((last - previous) * step < minGap) keep.splice(keep.length - 2, 1)
  }

  return categories.map((label, index) => (keep.includes(index) ? label : ''))
}

/** 数值 → 图表库的画图值（金额换算成"元"，其余原样）。 */
export function displayValue(value: number, kind: ChartValueKind): number {
  switch (kind) {
    case ChartValueKind.Money:
      return Math.fround(value / 100)
    case ChartValueKind.Percent:
    case ChartValueKind.Ratio:
    case ChartValueKind.Count:
      return Math.fround(value)
  }
}

/** 全部序列的显示值范围（与图表库自己算范围的口径一致：只看数据点）。 */
export function displayRange(
  series: readonly ChartSeries[],
  slots: number,
  kind: ChartValueKind,
): readonly [min: number, max: number] {
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  for (const item of series) {
    for (let slot = 0; slot < slots; slot += 1) {
      const value = displayValue(at(item.data, slot) ?? 0, kind)
      min = Math.min(min, value)
      max = Math.max(max, value)
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 0]
  return [min, max]
}

/**
 * "大整数"步长阶梯：`1 / 2 / 5 × 10^k`（… 500 / 1000 / 2000 / 5000 / 10000 …），升序。
 *
 * 从比数据量级低两档起步（数据是几万元时从百位起步），往上给 12 档 —— 足够覆盖到
 * `f32` 能表示的极端值；{@link niceAxisRange} 取其中第一个"段数够用"的。
 */
function* niceSteps(scale: number): Generator<number> {
  const startPower = Number.isFinite(scale) && scale > 0 ? Math.floor(Math.log10(scale)) - 2 : 0
  for (let power = startPower; power <= startPower + 12; power += 1) {
    const base = 10 ** power
    for (const factor of [1, 2, 5]) {
      yield factor * base
    }
  }
}

/** Y 轴范围 `(min, max, splits)`：刻度就是 `min + i × (max - min) / splits`。 */
export type AxisRange = readonly [min: number, max: number, splits: number]

/**
 * Y 轴范围：刻度必须是**大整数**，上下界**各自贴合数据**（不强制以 0 对称）。
 *
 * 返回 `(min, max, splits)`；刻度就是 `min + i × (max - min) / splits`。
 *
 * 为什么自己算而不用图表库的默认：它那套"把步长往上取整"的阶梯按数量级分档
 * （`< 10000` 的步长按 100 取整），于是 `36000 ÷ 4 = 9000` 会被抬成 9100/9500/9600 之类，
 * 刻度就变成 9,500 / 19,000 / 28,500 —— 读图时得先做除法。这里只从 {@link niceSteps}
 * （1/2/5 × 10^k）里挑步长，刻度因此永远是可心算的数。
 *
 * 挑法是**能满足段数上限的最小步长**（网格尽量细），所以代价是：数据最大值恰好落在刻度上时，
 * 那一档因为"上界必须严格大于数据"要多出一段，可能撞上段数上限而让位给粗一档的步长
 * （如数据 `0..5000` 给的是 0/2000/4000/6000，而不是 0/1000/…/6000）。
 *
 * **不做上下对称**：`-35..90` 给的是 `-50..100`（期望值那张图曾经被撑成 `±100`，
 * 底下 50 的空白里一个数据点都没有）。上下界都对齐到步长的整数倍，0 因此**仍然是**
 * 一条刻度（`0 = 0 × step`），涨跌照样从 0 轴读，只是不再各留一半空白。
 *
 * `bounds` 是调用方给的天生上下界（见渲染侧的 `ChartConfig::y_bounds`）：数据落在里面就直接用，
 * 于是"胜率"这类百分比指标拿到的是 `0..100` 而不是被撑到 150。
 *
 * 算不出（数据非有限、或极端量级下 6 段都放不下）时返回 `null`，交给图表库自己决定。
 */
export function niceAxisRange(
  dataMin: number,
  dataMax: number,
  bounds: readonly [low: number, high: number] | null,
): AxisRange | null {
  // Rust 文档写明"数据非有限就返回 None"；实现里 `+∞` 会让下面的 `while` 转不出来，
  // 这里按文档先挡住（NaN 走原路径，自然落到 None）。
  if (!Number.isFinite(dataMin) || !Number.isFinite(dataMax)) return null
  if (bounds !== null) {
    const [low, high] = bounds
    if (high > low && dataMin >= low && dataMax <= high) {
      // 上界必须**严格**大于数据最大值（图表库只在 `axis_max > 数据最大值` 时才认它），
      // 数据正好贴着上界（胜率首笔就 100%）时抬一个**不会出现在刻度文字里**的微量：
      // 刻度按一位小数格式化。
      const upper = dataMax >= high ? high + AXIS_LIMIT_EPSILON : high
      return [low, upper, Y_SPLITS]
    }
  }
  const scale = Math.max(Math.abs(dataMin), Math.abs(dataMax), dataMax - dataMin)
  for (const step of niceSteps(scale)) {
    // 上下界各自对齐到步长的整数倍；全正的数据从 0 起算（与图表库的默认一致）
    const low = dataMin > 0 ? 0 : dataMin
    const lowUnits = Math.floor(low / step)
    let highUnits = Math.ceil(Math.max(low, dataMax) / step)
    // 上界必须**严格**大于数据最大值：图表库只在 `axis_max > 数据最大值` 时才认这个
    // 自定义上界，否则它退回自己那套阶梯（等于白算）。用 f32 比较（它就是 f32），
    // 所以可能要多抬一格。
    while (Math.fround(highUnits * step) <= Math.fround(dataMax)) {
      highUnits += 1
    }
    const min = lowUnits * step
    const max = highUnits * step
    const splits = Math.round((max - min) / step)
    if (Number.isFinite(splits) && splits >= 1 && splits <= Y_AXIS_MAX_SPLITS) {
      return [min, max, splits]
    }
  }
  return null
}

// ==================================================================== 叠层几何

/** 从 DOM 量回来的一个数据点：`(颜色, x, y)`（像素相对画布左上角）。 */
export type MeasuredPoint = readonly [color: string, x: number, y: number]

/** 从 DOM 量回来的数据点（每个序列一组 `(颜色, x, y)`，像素相对画布左上角）。 */
export type MeasuredPoints = readonly (readonly MeasuredPoint[])[]

/** tooltip 的一行：`(label, 颜色, 文案)`。 */
export type ChartRow = readonly [label: string, color: string, text: string]

/** 值 → y 的仿射映射 `(v0, y0, v1, y1)`（画图值，金额是元）。 */
export type ChartValueAxis = readonly [v0: number, y0: number, v1: number, y1: number]

/** 叠层几何：DOM 量回来的像素坐标 + 组件自己知道的数据。 */
export interface ChartGeometry {
  /** 每个类目的 x 像素 */
  readonly xs: readonly number[]
  /** 每个类目上各序列的 `(颜色, x, y)` */
  readonly dots: MeasuredPoints
  /** X 轴类目文案 */
  readonly categories: readonly string[]
  /** tooltip 行：每个序列一组 `(label, 颜色, 文案)` */
  readonly rows: readonly (readonly ChartRow[])[]
  /** 值 → y 的仿射映射 `(v0, y0, v1, y1)`（画图值，金额是元）；退化时为 `null` */
  readonly valueAxis: ChartValueAxis | null
  /**
   * 取值语义。`valueAxis` 存的是**画图值**，而 {@link yOf} 收的是**原始值**（金额是分），
   * 靠它换算。
   */
  readonly kind: ChartValueKind
}

/** 空几何（对应 Rust 的 `ChartGeometry::default()`）。 */
export function chartGeometry(overrides: Partial<ChartGeometry> = {}): ChartGeometry {
  return {
    xs: overrides.xs ?? [],
    dots: overrides.dots ?? [],
    categories: overrides.categories ?? [],
    rows: overrides.rows ?? [],
    valueAxis: overrides.valueAxis ?? null,
    kind: overrides.kind ?? DEFAULT_CHART_VALUE_KIND,
  }
}

/** 把量回来的点与原始数据拼成完整几何（对应 Rust 的 `ChartGeometry::assemble`）。 */
export function assembleGeometry(
  points: MeasuredPoints,
  categories: readonly string[],
  series: readonly ChartSeries[],
  kind: ChartValueKind,
): ChartGeometry {
  const count = points.reduce((widest, item) => Math.max(widest, item.length), 0)
  // 每个类目的 x：多个序列取平均（同一类目上它们共享 x）
  const xs: number[] = []
  for (let index = 0; index < count; index += 1) {
    const values: number[] = []
    for (const item of points) {
      const point = at(item, index)
      if (point !== undefined) values.push(point[1])
    }
    xs.push(
      values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length,
    )
  }
  // 值 → y 的仿射映射：找任意一个"两个点取值不同"的序列
  let valueAxis: ChartValueAxis | null = null
  for (let seriesIndex = 0; seriesIndex < points.length; seriesIndex += 1) {
    const data = at(series, seriesIndex)
    if (data === undefined) continue
    const item = points[seriesIndex]
    const first = at(item, 0)
    if (first === undefined) continue
    const firstValue = displayValue(at(data.data, 0) ?? 0, kind)
    for (let offset = 1; offset < item.length; offset += 1) {
      const point = item[offset]
      const value = displayValue(at(data.data, offset) ?? 0, kind)
      if (Math.abs(value - firstValue) > Number.EPSILON) {
        valueAxis = [firstValue, first[2], value, point[2]]
        break
      }
    }
    if (valueAxis !== null) break
  }
  const rows = series.map((item) =>
    Array.from({ length: count }, (_, slot): ChartRow => {
      const value = at(item.data, slot) ?? 0
      return [item.label, item.color, formatValue(value, kind, true)]
    }),
  )
  return {
    xs,
    dots: points,
    categories: [...categories],
    rows,
    valueAxis,
    kind,
  }
}

/**
 * 参考值 → y 像素。
 *
 * 入参与虚线参考线同单位：**金额是分**；`valueAxis` 里存的是画图值（金额是元），所以这里
 * 先过一遍 {@link displayValue} —— 否则金额图上的非零参考线会画到画面外（实测：
 * `reference(10000)` 算出 -99 万）。
 */
export function yOf(geometry: ChartGeometry, value: number): number | null {
  const axis = geometry.valueAxis
  if (axis === null) return null
  const [v0, y0, v1, y1] = axis
  if (Math.abs(v1 - v0) < Number.EPSILON) return null
  const shown = displayValue(value, geometry.kind)
  return y0 + ((shown - v0) / (v1 - v0)) * (y1 - y0)
}

/** 绘图区的纵向范围（数据点上下边界）。 */
export function yRange(geometry: ChartGeometry): readonly [top: number, bottom: number] {
  let top = Number.POSITIVE_INFINITY
  let bottom = Number.NEGATIVE_INFINITY
  for (const item of geometry.dots) {
    for (const point of item) {
      top = Math.min(top, point[2])
      bottom = Math.max(bottom, point[2])
    }
  }
  if (!Number.isFinite(top) || !Number.isFinite(bottom)) return [0, 0]
  return [top, bottom]
}

/** 绘图区的横向范围（首尾类目）。 */
export function xExtent(geometry: ChartGeometry): readonly [left: number, right: number] {
  return [
    at(geometry.xs, 0) ?? 0,
    at(geometry.xs, geometry.xs.length - 1) ?? 0,
  ]
}

/** 某个类目上各序列的命中点。 */
export function pointsAt(geometry: ChartGeometry, index: number): MeasuredPoint[] {
  const found: MeasuredPoint[] = []
  for (const item of geometry.dots) {
    const point = at(item, index)
    if (point !== undefined) found.push(point)
  }
  return found
}

/** 某个类目的 tooltip 行。 */
export function rowsAt(geometry: ChartGeometry, index: number): ChartRow[] {
  const found: ChartRow[] = []
  for (const item of geometry.rows) {
    const row = at(item, index)
    if (row !== undefined) found.push(row)
  }
  return found
}

/**
 * 这个 `<g>` 分组算不算"一条可用的序列"（判定抽成纯函数，便于单测）。
 *
 * ⚠ **不能要求至少两个圆**：只有一个类目时每个序列只有一个数据点、只有一个 `<circle>`，
 * 按"< 2 就跳过"会把整条序列丢掉 → 几何为空 → tooltip 永远不显示
 * （实测缺陷：「只有一组数据时图表上的 tooltip 不显示」）。非空即可。
 */
export function groupIsSeries(paths: number, circles: number): boolean {
  return paths > 0 && circles > 0
}

/** 命中最近的类目。 */
export function hitIndex(geometry: ChartGeometry, offsetX: number): number | null {
  if (geometry.xs.length === 0) return null
  let best: { readonly index: number; readonly distance: number } | null = null
  for (let index = 0; index < geometry.xs.length; index += 1) {
    const distance = Math.abs(geometry.xs[index] - offsetX)
    if (best === null || distance < best.distance) best = { index, distance }
  }
  return best === null ? null : best.index
}

/** 读数组的第 `index` 项（Rust `.get` 的对应物：越界是 `undefined`，不是类型上的假象）。 */
function at<T>(items: readonly T[], index: number): T | undefined {
  return index >= 0 && index < items.length ? items[index] : undefined
}

// ==================================================================== 颜色

/** 估算标签像素宽度（只用来决定抽稀，粗算即可）：CJK/全角按 1.0 em，其余按 0.6 em。 */
function estimatedLabelWidth(label: string, fontPx: number): number {
  let width = 0
  for (const char of label) {
    width += isWideChar(char) ? fontPx : fontPx * 0.6
  }
  return width
}

/** 是否宽字符（常用 CJK 与全角标点的粗略区间）。 */
function isWideChar(char: string): boolean {
  const code = char.codePointAt(0)
  if (code === undefined) return false
  return (
    (code >= 0x1100 && code <= 0x115f) ||
    (code >= 0x2e80 && code <= 0xa4cf) ||
    (code >= 0xac00 && code <= 0xd7a3) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xfe30 && code <= 0xfe4f) ||
    (code >= 0xff00 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6)
  )
}

// ==================================================================== 数值格式

/**
 * 数值 → 展示文案。
 *
 * * `Money`：分 → 元两位小数（`withSymbol` 为真时带 `¥`）
 * * `Percent`：两位小数 + `%`
 * * `Ratio`：两位小数（比值 / 倍数）
 * * `Count`：整数
 */
export function formatValue(value: number, kind: ChartValueKind, withSymbol: boolean): string {
  switch (kind) {
    case ChartValueKind.Money: {
      // 金额按分存、按元显示（两位小数）；`number` 对分这个量级是精确的
      const yuan = (value / 100).toFixed(2)
      return withSymbol ? `¥${yuan}` : yuan
    }
    case ChartValueKind.Percent:
      return `${value.toFixed(2)}%`
    case ChartValueKind.Ratio:
      return value.toFixed(2)
    case ChartValueKind.Count:
      // Rust `f64::to_string`：整数值不带 `.0`；`String` 只在 |value| ≥ 1e21 时改成指数
      // 写法（Count 是整数计数，界面上到不了那个量级）。
      return String(value)
  }
}
