/**
 * 东方财富「涨停股池」适配器：按交易日取当日涨停股（含连板数、封板时间、炸板次数）。
 *
 * 接口是公开但**未文档化**的（`push2ex.eastmoney.com/getTopicZTPool`），所以：
 * * 解析是纯函数（{@link parseLimitPoolPayload}），单测用固定 payload 断言；
 * * 网络只在这里发生，`fetchImpl` 可注入（生产走 `appFetch`，跟随代理）；
 * * 任何网络 / HTTP / 解析失败都**抛错**，由服务层决定是报错还是退回本地缓存 ——
 *   这里不吞错，因为「今天没有涨停」和「今天没抓到」必须分得开。
 *
 * 已知约束（2026-10 实测）：
 * * 必须带公开 token `ut`，不带返回 `rc=102`；
 * * `date=YYYYMMDD` 真实生效，但只覆盖最近约一个月，更早的日期返回空池；
 * * 响应是 UTF-8 JSON（不是行情接口那种 GBK）；
 * * 盘中（15:00 前）池子会持续变化，是否入库由服务层判断。
 */

import { AppError } from '../../shared/errors'
import type { StockLimitEntry } from '../../shared/types/stock-limit'

/** 东财涨停池的默认地址（测试可用 `baseUrl` 指向本地服务）。 */
export const LIMIT_POOL_BASE = 'https://push2ex.eastmoney.com'
export const LIMIT_POOL_PATH = '/getTopicZTPool'
const LIMIT_POOL_UT = '7eea3edcaed734bea9cbfc24409ed989'

/** 单次请求超时：8 秒（比行情宽一点，池子 payload 更大）。 */
export const LIMIT_POOL_TIMEOUT_MS = 8_000

/** 一次抓取最多取 1000 只；A 股单日涨停从未接近这个数。 */
const PAGE_SIZE = 1000

/** 请求头：接口对浏览器 UA 友好，带一个普通的即可。 */
const REQUEST_HEADERS: Record<string, string> = {
  Accept: 'application/json, text/plain, */*',
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
}

/** 涨停池数据源（端口）：返回当日的涨停股；空数组表示"该日没有涨停数据"。 */
export interface LimitPoolSource {
  fetchDay(date: string): Promise<StockLimitEntry[]>
}

/** 行情请求的响应形状（测试可注入极简对象）。 */
export interface LimitHttpResponse {
  readonly ok: boolean
  readonly status?: number
  arrayBuffer(): Promise<ArrayBuffer>
}

/** HTTP 客户端（可注入）；`init` 只暴露适配器真正用到的两样。 */
export type LimitFetch = (
  url: string,
  init: { signal: AbortSignal; headers: Record<string, string> },
) => Promise<LimitHttpResponse>

const defaultLimitFetch: LimitFetch = (url, init) => fetch(url, init)

/** 东财原始响应里的一条（只列用得到的字段）。 */
interface RawLimitEntry {
  c?: unknown
  n?: unknown
  m?: unknown
  p?: unknown
  zdp?: unknown
  amount?: unknown
  ltsz?: unknown
  hs?: unknown
  lbc?: unknown
  fbt?: unknown
  lbt?: unknown
  zbc?: unknown
  fund?: unknown
  hybk?: unknown
  zttj?: { days?: unknown; ct?: unknown } | null
}

interface RawLimitPayload {
  rc?: unknown
  data?: { tc?: unknown; pool?: unknown } | null
}

/** 六位 A 股代码（含北交所 92xxxx）。 */
const CODE_PATTERN = /^[0-9]{6}$/

function finiteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function integerValue(value: unknown, fallback = 0): number {
  return Math.trunc(finiteNumber(value, fallback))
}

function roundTo2(value: number): number {
  return Math.round(value * 100) / 100
}

/**
 * 解析涨停池响应文本；`null` 表示这不是一份可用的响应（JSON 坏了，或 `rc !== 0`）。
 *
 * 逐条校验：代码必须是六位数字，连板数 < 1 按 1 处理（首板）。
 * 同一代码重复出现时保留第一条（分页拼接时可能出现）。
 */
export function parseLimitPoolPayload(text: string): StockLimitEntry[] | null {
  let payload: RawLimitPayload
  try {
    payload = JSON.parse(text) as RawLimitPayload
  } catch {
    return null
  }
  if (!payload || typeof payload !== 'object') return null
  if (integerValue(payload.rc, -1) !== 0) return null
  const pool = payload.data?.pool
  if (!Array.isArray(pool)) return null

  const seen = new Set<string>()
  const entries: StockLimitEntry[] = []
  for (const raw of pool as RawLimitEntry[]) {
    if (!raw || typeof raw !== 'object') continue
    const stockCode = typeof raw.c === 'string' ? raw.c.trim() : ''
    if (!CODE_PATTERN.test(stockCode) || seen.has(stockCode)) continue
    seen.add(stockCode)

    const statistics = raw.zttj ?? null
    entries.push({
      stockCode,
      stockName: typeof raw.n === 'string' ? raw.n.trim() : stockCode,
      market: integerValue(raw.m),
      // 东财的价格字段本身就是整数厘（11000 → ¥11.00），不再做元换算。
      priceMilli: integerValue(raw.p),
      pct: roundTo2(finiteNumber(raw.zdp)),
      amountCents: integerValue(finiteNumber(raw.amount) * 100),
      floatMvCents: integerValue(finiteNumber(raw.ltsz) * 100),
      turnover: roundTo2(finiteNumber(raw.hs)),
      level: Math.max(1, integerValue(raw.lbc, 1)),
      firstSeal: integerValue(raw.fbt),
      lastSeal: integerValue(raw.lbt),
      brokenCount: integerValue(raw.zbc),
      sealFundCents: integerValue(finiteNumber(raw.fund) * 100),
      industry: typeof raw.hybk === 'string' ? raw.hybk.trim() : '',
      statDays: integerValue(statistics?.days),
      statCount: integerValue(statistics?.ct),
    })
  }

  entries.sort((left, right) => {
    if (left.firstSeal !== right.firstSeal) return left.firstSeal - right.firstSeal
    return left.stockCode.localeCompare(right.stockCode)
  })
  return entries
}

/** 东财涨停池实现。 */
export class EastmoneyLimitPoolSource implements LimitPoolSource {
  private readonly fetchImpl: LimitFetch
  private readonly baseUrl: string
  private readonly timeoutMs: number

  constructor(options: { fetchImpl?: LimitFetch; baseUrl?: string; timeoutMs?: number } = {}) {
    this.fetchImpl = options.fetchImpl ?? defaultLimitFetch
    this.baseUrl = options.baseUrl ?? LIMIT_POOL_BASE
    this.timeoutMs = options.timeoutMs ?? LIMIT_POOL_TIMEOUT_MS
  }

  async fetchDay(date: string): Promise<StockLimitEntry[]> {
    const queryDate = date.replaceAll('-', '')
    if (!/^[0-9]{8}$/.test(queryDate)) {
      throw new AppError('日期格式无效', { status: 400 })
    }
    const params = new URLSearchParams({
      ut: LIMIT_POOL_UT,
      dpt: 'wz.ztzt',
      Pageindex: '0',
      pagesize: String(PAGE_SIZE),
      sort: 'fbt:asc',
      date: queryDate,
      _: String(Date.now()),
    })
    const url = `${this.baseUrl}${LIMIT_POOL_PATH}?${params.toString()}`

    let response: LimitHttpResponse
    try {
      response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: REQUEST_HEADERS,
      })
    } catch (error) {
      throw new AppError(`查询涨停池失败(网络): ${String(error)}`, { status: 502 })
    }
    if (!response.ok) {
      throw new AppError(`查询涨停池失败(HTTP ${response.status ?? '?'})`, { status: 502 })
    }

    let text: string
    try {
      text = new TextDecoder('utf-8').decode(await response.arrayBuffer())
    } catch (error) {
      throw new AppError(`读取涨停池响应失败: ${String(error)}`, { status: 502 })
    }

    const entries = parseLimitPoolPayload(text)
    if (entries === null) {
      throw new AppError('涨停池接口返回异常', { status: 502 })
    }
    return entries
  }
}
