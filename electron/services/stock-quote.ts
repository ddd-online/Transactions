/**
 * 行情抓取抽象：按股票代码取最新价 / 昨收价，以及查询股票名称。
 *
 * 逐条移植自旧版 `tr-service/src/quote.rs`。拆成独立模块的理由与旧版一致：
 * 服务层（`stock-positions`）只依赖 {@link StockQuoteFetcher} trait 的 TS 版本，
 * 从而可以在没有网络的环境里用 stub 做确定性测试；真实实现（腾讯行情 `qt.gtimg.cn`）
 * 集中在这里，并且**解析逻辑与网络分离**（{@link parseTencentQuotePayload} 是纯函数，
 * 可以直接用固定 payload 断言）。
 *
 * 网络约束（旧版逐字保留）：
 * * `http://qt.gtimg.cn/q=<market><code>[,<market><code>...]`，**3 秒超时**；
 * * 响应是 GBK 编码，需要按 GBK 解码后再按 `~` 切分；
 * * 停牌（最新价 0）或非法价格视为"该股无行情"，静默跳过；
 * * 任何网络 / 解码 / HTTP 失败都返回**空映射**而不是错误 —— 行情是临时外部数据，
 *   **不得阻塞录入**（`fetchName` 失败返回空串）。
 *
 * 与旧版的差异只有两处，都是运行环境带来的：
 * 1. Node 的网络 API 只有异步的，所以端口签名是 `Promise`（旧版是同步 trait）；
 * 2. 旧版把 ureq 的代理设置注入 agent；本仓库目前只有 `shared/domain/proxy` 的纯逻辑，
 *    还没有 HTTP 客户端侧的代理解析器，因此这个 adapter 走直连。`fetchImpl` 可注入，
 *    以后接上代理只需替换它，不动解析与端口。
 */

import { isValidStockCode, marketPrefix } from '../../shared/domain/fee'
import { priceYuanToMilli } from '../../shared/domain/money'
import { nowSeconds } from '../../shared/domain/time'
import type { StockQuoteDto } from '../../shared/types/stock-position'
import { logWarn } from '../logging'

/** 腾讯行情字段分隔符。 */
const FIELD_SEPARATOR = '~'

/** 行情请求超时：3 秒（与旧版 `QUOTE_TIMEOUT` 一致）。 */
export const QUOTE_TIMEOUT_MS = 3_000

/** 腾讯行情请求地址前缀。 */
const QUOTE_ENDPOINT = 'http://qt.gtimg.cn/q='

/**
 * 批量行情源：按股票代码返回最新价与昨收价。
 *
 * 返回的映射只包含请求中解析成功的股票；失败时返回空映射（**不抛错**）。
 * 旧版的实现者要求 `Send + Sync`；TS 这边只要是无共享可变状态的普通对象即可。
 */
export interface StockQuoteFetcher {
  /** 批量拉取行情。 */
  fetchQuotes(codes: readonly string[]): Promise<Map<string, StockQuoteDto>>
  /** 查询单只股票名称。查询失败或无行情时返回空串（不阻塞录入）。 */
  fetchName(code: string): Promise<string>
}

/** 行情请求的响应形状（只取 adapter 需要的两样，测试可注入极简对象）。 */
export interface QuoteHttpResponse {
  readonly ok: boolean
  readonly status?: number
  arrayBuffer(): Promise<ArrayBuffer>
}

/**
 * 行情 HTTP 客户端（可注入）。
 *
 * 用窄接口而不是 `typeof fetch`：测试不必构造 `Response`，同时把"只读 body"的用法钉住。
 */
export type QuoteFetch = (url: string, signal: AbortSignal) => Promise<QuoteHttpResponse>

const defaultQuoteFetch: QuoteFetch = (url, signal) => fetch(url, { signal })

/** 腾讯行情实现（`qt.gtimg.cn`）。名称查询与行情查询同源。 */
export class TencentStockQuoteFetcher implements StockQuoteFetcher {
  private readonly fetchImpl: QuoteFetch
  private readonly timeoutMs: number

  constructor(options: { fetchImpl?: QuoteFetch; timeoutMs?: number } = {}) {
    this.fetchImpl = options.fetchImpl ?? defaultQuoteFetch
    this.timeoutMs = options.timeoutMs ?? QUOTE_TIMEOUT_MS
  }

  async fetchQuotes(codes: readonly string[]): Promise<Map<string, StockQuoteDto>> {
    const result = new Map<string, StockQuoteDto>()
    if (codes.length === 0) return result

    // 过滤非法代码与重复项，拼出 `sh600000,sz000001` 形式的查询串。
    const query: string[] = []
    const requested: string[] = []
    for (const raw of codes) {
      const code = raw.trim()
      if (!isValidStockCode(code)) continue
      if (requested.includes(code)) continue
      requested.push(code)
      query.push(`${marketPrefix(code)}${code}`)
    }
    if (query.length === 0) return result

    const payload = await this.fetchPayload(`${QUOTE_ENDPOINT}${query.join(',')}`)
    if (payload === null) return result

    const parsed = parseTencentQuotePayload(decodeGbk(payload))
    for (const code of requested) {
      const quote = parsed.get(code)
      if (quote) result.set(code, quote)
    }
    return result
  }

  async fetchName(code: string): Promise<string> {
    // 仅支持 A 股六位代码，避免非法入参打到外部接口。
    if (!isValidStockCode(code)) return ''
    const payload = await this.fetchPayload(`${QUOTE_ENDPOINT}${marketPrefix(code)}${code}`)
    if (payload === null) return ''
    return parseTencentName(decodeGbk(payload))
  }

  /** 发起一次行情请求；任何失败都返回 `null`（调用方据此给出空结果）。 */
  private async fetchPayload(url: string): Promise<Uint8Array | null> {
    try {
      const response = await this.fetchImpl(url, AbortSignal.timeout(this.timeoutMs))
      if (!response.ok) {
        logWarn(`查询股票行情失败(网络): ${url} (HTTP ${response.status ?? '?'})`)
        return null
      }
      return new Uint8Array(await response.arrayBuffer())
    } catch (error) {
      logWarn(`查询股票行情失败(网络): ${url} (${String(error)})`)
      return null
    }
  }
}

// ---------------------------------------------------------------- GBK 解码

let gbkDecoder: TextDecoder | null | undefined

/**
 * 腾讯行情响应按 GBK 解码。非法字节以替换字符处理（`TextDecoder` 默认行为）。
 *
 * Node 的 `TextDecoder` 只有带完整 ICU 的构建才认识 `gbk`；万一当前运行时没有这套编码，
 * 退回 UTF-8 并记一条警告 —— 行情本身是临时数据，宁可有乱码的名称，也不让持仓页报错。
 */
export function decodeGbk(payload: Uint8Array): string {
  if (gbkDecoder === undefined) {
    try {
      gbkDecoder = new TextDecoder('gbk')
    } catch {
      gbkDecoder = null
      logWarn('当前 Node 运行时没有 GBK 解码器（需要完整 ICU），股票名称可能显示为乱码')
    }
  }
  if (gbkDecoder !== null) return gbkDecoder.decode(payload)
  return new TextDecoder('utf-8').decode(payload)
}

// ---------------------------------------------------------------- 纯解析

/**
 * 遍历响应里全部 `v_xxx="..."` 段落（批量请求会返回多行）。
 *
 * 这里手工扫描 `v_xxx="..."` 而不是用正则：对合法响应两者结果相同，而手工扫描不会把
 * "正则回溯"这类行为差异带进来。`parseTencentName` 只取其中的第一段（`.first()`）。
 */
function allQuoteFields(payload: string): string[][] {
  const result: string[][] = []
  let rest = payload
  while (true) {
    const start = rest.indexOf('v_')
    if (start < 0) break
    const candidate = rest.slice(start + 2)
    let consumed = 0
    const quoteStart = candidate.indexOf('=')
    if (quoteStart >= 0) {
      const afterEq = candidate.slice(quoteStart + 1)
      if (afterEq.startsWith('"')) {
        const stripped = afterEq.slice(1)
        const end = stripped.indexOf('"')
        if (end >= 0) {
          result.push(stripped.slice(0, end).split(FIELD_SEPARATOR))
          consumed = quoteStart + 1 + 1 + end + 1
        }
      }
    }
    rest = consumed === 0 ? rest.slice(start + 2) : candidate.slice(consumed)
  }
  return result
}

/**
 * 价格文本 → 浮点，语义对齐 Rust 的 `str::parse::<f64>()`。
 *
 * `Number()` 太宽（认得 `0x10`、`Infinity`），而 TEN 行情只会给十进制小数；
 * 这里用有限十进制文法把那些边角值当成"非法价格"跳过。
 */
function parseDecimal(raw: string): number | null {
  if (!/^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/.test(raw)) return null
  const value = Number(raw)
  return Number.isFinite(value) ? value : null
}

/**
 * 解析腾讯行情响应文本，返回全部可识别的 A 股行情。
 *
 * 腾讯字段以 `~` 分隔：名称[1]、代码[2]、最新价[3]、昨收[4]、行情时间[30]（`YYYYMMDDHHMMSS`）。
 * 字段不足 5 段、代码不合法、价格 <= 0（停牌）或无法解析时跳过该股。
 * 行情时间缺失 / 非法时退化为"当前时间"（`now` 可注入，测试用）。
 */
export function parseTencentQuotePayload(
  payload: string,
  now: number = nowSeconds(),
): Map<string, StockQuoteDto> {
  const result = new Map<string, StockQuoteDto>()
  for (const parts of allQuoteFields(payload)) {
    if (parts.length < 5) continue
    const code = parts[2].trim()
    if (!isValidStockCode(code)) continue

    const latestText = parts[3].trim()
    const prevCloseText = parts[4].trim()
    const latestYuan = parseDecimal(latestText)
    const prevCloseYuan = parseDecimal(prevCloseText)
    if (latestYuan === null || prevCloseYuan === null) continue
    if (latestYuan <= 0 || prevCloseYuan <= 0) continue // 停牌 / 非法值视为该股无行情

    let quoteTime = now
    if (parts.length > 30) {
      const parsed = parseQuoteTimestamp(parts[30].trim())
      if (parsed !== null) quoteTime = parsed
    }
    result.set(code, {
      stockCode: code,
      // 价格由元换算为整数**厘**：规则在 `shared/domain/money`（别在这儿再写一遍）
      latestPrice: priceYuanToMilli(latestYuan),
      prevClose: priceYuanToMilli(prevCloseYuan),
      quoteTime,
    })
  }
  return result
}

/** 解析单只股票名称：取第一段 `v_xxx="..."` 的第 [1] 段并去空白。 */
export function parseTencentName(payload: string): string {
  const first = allQuoteFields(payload)[0]
  if (!first || first.length < 2) return ''
  return first[1].trim()
}

/**
 * 解析 `YYYYMMDDHHMMSS`（**UTC 语义**）为 Unix 秒。非法时返回 `null`。
 *
 * 旧版 `parse_quote_timestamp` 用的是 `NaiveDateTime::and_utc()`：注释虽写"本地时区语义"，
 * 实际按 UTC 折算，这里保持同一行为（抓到的只是行情时刻，差几小时不影响"什么时候抓的"）。
 * 严格的 14 位数字 + 真实日期时间校验：`20261304150000` 这类畸形值一律 `null`。
 */
export function parseQuoteTimestamp(raw: string): number | null {
  if (raw.length !== 14 || !/^[0-9]{14}$/.test(raw)) return null
  const year = Number(raw.slice(0, 4))
  const month = Number(raw.slice(4, 6))
  const day = Number(raw.slice(6, 8))
  const hour = Number(raw.slice(8, 10))
  const minute = Number(raw.slice(10, 12))
  const second = Number(raw.slice(12, 14))
  if (month < 1 || month > 12) return null
  if (day < 1 || day > 31) return null
  if (hour > 23 || minute > 59 || second > 59) return null

  // `Date.UTC` 把 0-99 年当 1900+year，先设公元后再设月日，避免这个特殊分支。
  const date = new Date(0)
  date.setUTCFullYear(year, month - 1, day)
  date.setUTCHours(hour, minute, second, 0)
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day ||
    date.getUTCHours() !== hour ||
    date.getUTCMinutes() !== minute ||
    date.getUTCSeconds() !== second
  ) {
    return null
  }
  return Math.trunc(date.getTime() / 1000)
}
