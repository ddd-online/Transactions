import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace, type OpenedWorkspace } from '../../electron/db'
import { createFundRecord } from '../../electron/db/dao/stock-fund'
import {
  type StockPosition,
  createPosition,
  createTrade,
  getPosition,
  updatePosition,
} from '../../electron/db/dao/stock-trade'
import { setPrincipal, withdraw } from '../../electron/services/stock-account'
import {
  getOverview,
  listPositions,
  updatePositionReview,
  updatePositionTag,
} from '../../electron/services/stock-positions'
import {
  QUOTE_TIMEOUT_MS,
  type QuoteHttpResponse,
  type StockQuoteFetcher,
  TencentStockQuoteFetcher,
  decodeGbk,
  parseQuoteTimestamp,
  parseTencentName,
  parseTencentQuotePayload,
} from '../../electron/services/stock-quote'
import {
  STOCK_EVENT_SELL,
  STOCK_TAG_ANALYSIS,
  STOCK_TAG_DABAN,
  STOCK_TRADE_ADD,
  STOCK_TRADE_CLOSE,
  STOCK_TRADE_OPEN,
  STOCK_TRADE_REDUCE,
} from '../../shared/domain/consts'
import type { RoundFee } from '../../shared/domain/models'
import { floatingPnlRate } from '../../shared/domain/stock'
import { AppError } from '../../shared/errors'
import type { StockPositionDto, StockQuoteDto } from '../../shared/types/stock-position'

const LEDGER = 'ledger-under-test'

const directories: string[] = []
let tradeSequence = 0
let fundSequence = 0

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-positions-test-'))
  directories.push(directory)
  return directory
}

function newWorkspace(): OpenedWorkspace {
  return openWorkspace(workspaceDirectory())
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

/** 断言会抛 `AppError`，并把它返回给调用方继续断言文案 / 状态码。 */
function appError(run: () => unknown): AppError {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(AppError)
    return error as AppError
  }
  throw new Error('应当抛错')
}

/** 本地某天 00:00 的 Unix 秒（股票域的时间戳落在本地 00:00）。 */
function localDay(year: number, month: number, day: number): number {
  return Math.trunc(new Date(year, month - 1, day, 0, 0, 0).getTime() / 1000)
}

// ---------------------------------------------------------------- 造数

function seedPosition(
  workspace: OpenedWorkspace,
  fields: Partial<StockPosition> & Pick<StockPosition, 'stockCode'>,
): void {
  createPosition(workspace.db, {
    id: fields.id ?? `position-${fields.stockCode}`,
    ledgerId: LEDGER,
    stockCode: fields.stockCode,
    stockName: fields.stockName ?? '测试股票',
    quantity: fields.quantity ?? 0,
    totalCost: fields.totalCost ?? 0,
    realizedPnl: fields.realizedPnl ?? 0,
    review: fields.review ?? '',
    tag: fields.tag ?? '',
    createdAt: fields.createdAt ?? 1,
    updatedAt: fields.updatedAt ?? 1,
  })
}

interface TradeSeed {
  stockCode: string
  tradeType: string
  /** 成交额（分） */
  amount: number
  fee?: number
  lots?: number
  shares?: number
  /** 成交价（厘） */
  price?: number
  tradeTime?: number
  roundFee?: RoundFee | null
}

function seedTrade(workspace: OpenedWorkspace, seed: TradeSeed): void {
  const lots = seed.lots ?? 0
  createTrade(workspace.db, {
    id: `trade-${++tradeSequence}`,
    ledgerId: LEDGER,
    stockCode: seed.stockCode,
    stockName: '测试股票',
    tradeType: seed.tradeType,
    roundId: '',
    orderId: '',
    orderSeq: 1,
    price: seed.price ?? 0,
    lots,
    shares: seed.shares ?? lots * 100,
    amount: seed.amount,
    fee: seed.fee ?? 0,
    commission: 0,
    stampDuty: 0,
    transferFee: 0,
    realizedPnl: null,
    tradeTime: seed.tradeTime ?? 1_700_000_000,
    roundFee: seed.roundFee ?? null,
    remark: '',
    createdAt: 0,
  })
}

/** 直接种一条卖出资金记录（本切片不拥有写入流水线，只消费 `net_pnl` 汇总）。 */
function seedSellPnl(workspace: OpenedWorkspace, netPnl: number): void {
  createFundRecord(workspace.db, {
    id: `fund-${++fundSequence}`,
    ledgerId: LEDGER,
    recordDate: '2026-10-16',
    eventType: STOCK_EVENT_SELL,
    eventText: '卖出',
    amountChange: 0,
    cashBalance: 0,
    netPnl,
    remark: '',
    createdAt: 0,
  })
}

function seedDayReview(
  workspace: OpenedWorkspace,
  stockCode: string,
  date: string,
  review: string,
): void {
  workspace.db
    .prepare(
      'INSERT INTO stock_day_review ' +
        '(id, ledger_id, stock_code, round_id, review_date, review, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(`day-${stockCode}-${date}`, LEDGER, stockCode, '', date, review, 1, 1)
}

/** 清仓归档后持仓行是 0 手、成本 0（真实写入流水线会做这一步）。 */
function markPositionClosed(workspace: OpenedWorkspace, stockCode: string): void {
  const position = getPosition(workspace.db, LEDGER, stockCode)
  position.quantity = 0
  position.totalCost = 0
  updatePosition(workspace.db, position)
}

// ---------------------------------------------------------------- 行情 stub

type QuoteEntry = Pick<StockQuoteDto, 'latestPrice' | 'prevClose' | 'quoteTime'>

/** 确定性行情源：只返回给定代码，绝不碰网络。 */
function quoteFetcher(entries: Record<string, QuoteEntry>): StockQuoteFetcher {
  return {
    async fetchQuotes(codes: readonly string[]): Promise<Map<string, StockQuoteDto>> {
      const result = new Map<string, StockQuoteDto>()
      for (const code of codes) {
        const entry = entries[code]
        if (entry) result.set(code, { stockCode: code, ...entry })
      }
      return result
    },
    async fetchName(): Promise<string> {
      return ''
    },
  }
}

function noQuotes(): StockQuoteFetcher {
  return quoteFetcher({})
}

function quoteOf(quotes: Map<string, StockQuoteDto>, code: string): StockQuoteDto {
  const quote = quotes.get(code)
  if (!quote) throw new Error(`缺少 ${code} 行情`)
  return quote
}

function positionOf(items: readonly StockPositionDto[], code: string): StockPositionDto {
  const item = items.find((candidate) => candidate.stockCode === code)
  if (!item) throw new Error(`缺少 ${code} 持仓`)
  return item
}

// ---------------------------------------------------------------- 腾讯 payload 造数

/** 造一条 32 段的腾讯行情行：名称[1]、代码[2]、最新价[3]、昨收[4]、时间[30]，其余为 `-`。 */
function quoteLine(
  code: string,
  latest: string,
  prev: string,
  timestamp: string,
  name = '测试股票',
): string {
  const parts = new Array<string>(32).fill('-')
  parts[1] = name
  parts[2] = code
  parts[3] = latest
  parts[4] = prev
  parts[30] = timestamp
  return `v_sh${code}="${parts.join('~')}";`
}

function fakeResponse(bytes: Uint8Array): QuoteHttpResponse {
  const copy = Uint8Array.from(bytes)
  return {
    ok: true,
    status: 200,
    async arrayBuffer() {
      return copy.buffer.slice(copy.byteOffset, copy.byteOffset + copy.byteLength) as ArrayBuffer
    },
  }
}

function utf8Response(text: string): QuoteHttpResponse {
  return fakeResponse(new TextEncoder().encode(text))
}

function failureResponse(status: number): QuoteHttpResponse {
  return {
    ok: false,
    status,
    async arrayBuffer() {
      return new ArrayBuffer(0)
    },
  }
}

function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    result.set(chunk, offset)
    offset += chunk.length
  }
  return result
}

// ================================================================ 行情抓取

describe('stock quote fetcher (Tencent)', () => {
  it('parses quotes and skips suspended and malformed lines', () => {
    const payload = [
      quoteLine('600000', '10.20', '10.05', '20260904150000'),
      // 停牌：最新价 0 → 跳过
      quoteLine('000001', '0.00', '12.30', '20260904150000'),
      // 畸形价格 → 跳过
      quoteLine('600519', 'bad', '1500.00', '20260904150000'),
    ].join('\n')

    const quotes = parseTencentQuotePayload(payload, 1_700_000_000)
    expect(quotes.size, `应只解析 1 只股票: ${[...quotes.keys()].join(',')}`).toBe(1)

    const quote = quoteOf(quotes, '600000')
    expect(quote.latestPrice).toBe(10_200) // 10.20 元 = 10200 厘
    expect(quote.prevClose).toBe(10_050)
    expect(quote.quoteTime).toBe(Date.UTC(2026, 8, 4, 15, 0, 0) / 1000)
    expect(quote.stockCode).toBe('600000')
  })

  it('keeps milli precision for exchange-traded funds', () => {
    // 场内基金的报价是 0.001 元：厘装得下它，别退回"分"（会把 4.389 变成 4.39）。
    const quotes = parseTencentQuotePayload(
      quoteLine('510300', '4.389', '4.432', '20260904150000'),
    )
    const quote = quoteOf(quotes, '510300')
    expect(quote.latestPrice).toBe(4_389)
    expect(quote.prevClose).toBe(4_432)
  })

  it('skips unsupported codes and payloads with too few fields', () => {
    const payload = [
      // 北交所代码不在支持范围
      quoteLine('830799', '10.00', '10.00', '20260904150000'),
      // 段数不足 5
      'v_sh600000="1~2~3";',
    ].join('\n')
    expect(parseTencentQuotePayload(payload, 1_700_000_000).size).toBe(0)
  })

  it('falls back to the injected now when the timestamp is missing', () => {
    const quotes = parseTencentQuotePayload(
      quoteLine('600000', '10.20', '10.05', '-'),
      1_700_000_000,
    )
    expect(quoteOf(quotes, '600000').quoteTime).toBe(1_700_000_000)
  })

  it('parses the stock name from the second field', () => {
    expect(
      parseTencentName(quoteLine('600000', '10.20', '10.05', '20260904150000')),
    ).toBe('测试股票')
    expect(parseTencentName('garbage')).toBe('')
  })

  it('requires a real 14 digit timestamp', () => {
    expect(parseQuoteTimestamp('20260904150000')).toBe(
      Date.UTC(2026, 8, 4, 15, 0, 0) / 1000,
    )
    // 闰年 2-29 有效，平年无效
    expect(parseQuoteTimestamp('20240229150000')).not.toBeNull()
    expect(parseQuoteTimestamp('20250229150000')).toBeNull()
    expect(parseQuoteTimestamp('2026-09-04')).toBeNull()
    expect(parseQuoteTimestamp('20261304150000')).toBeNull()
    expect(parseQuoteTimestamp('20260904156000')).toBeNull()
  })

  it('decodes GBK payloads to Chinese names', () => {
    // "浦发银行" 的 GBK 字节
    const bytes = Uint8Array.from([0xc6, 0xd6, 0xb7, 0xa2, 0xd2, 0xf8, 0xd0, 0xd0])
    expect(decodeGbk(bytes)).toBe('浦发银行')
  })

  it('builds the Tencent URL, de-duplicates and filters codes', async () => {
    const urls: string[] = []
    const fetcher = new TencentStockQuoteFetcher({
      fetchImpl: async (url) => {
        urls.push(url)
        return utf8Response(quoteLine('600000', '10.20', '10.05', '20260904150000'))
      },
    })

    const quotes = await fetcher.fetchQuotes([' 600000 ', '000001', '600000', '830799'])
    expect(urls).toEqual(['http://qt.gtimg.cn/q=sh600000,sz000001'])
    // 只有 payload 里真有的那只有结果
    expect([...quotes.keys()]).toEqual(['600000'])
    expect(quoteOf(quotes, '600000').latestPrice).toBe(10_200)
  })

  it('returns an empty map for empty input without a request', async () => {
    let calls = 0
    const fetcher = new TencentStockQuoteFetcher({
      fetchImpl: async () => {
        calls += 1
        return utf8Response('')
      },
    })
    await expect(fetcher.fetchQuotes([])).resolves.toEqual(new Map())
    // 全是非法代码时同样不发请求
    await expect(fetcher.fetchQuotes(['bad', '830799'])).resolves.toEqual(new Map())
    expect(calls).toBe(0)
  })

  it('swallows HTTP and network failures', async () => {
    const httpFailure = new TencentStockQuoteFetcher({
      fetchImpl: async () => failureResponse(500),
    })
    await expect(httpFailure.fetchQuotes(['600000'])).resolves.toEqual(new Map())
    await expect(httpFailure.fetchName('600000')).resolves.toBe('')

    const networkFailure = new TencentStockQuoteFetcher({
      fetchImpl: async () => {
        throw new Error('boom')
      },
    })
    await expect(networkFailure.fetchQuotes(['600000'])).resolves.toEqual(new Map())
    await expect(networkFailure.fetchName('600000')).resolves.toBe('')
  })

  it('never hits the network for an invalid name lookup', async () => {
    let calls = 0
    const fetcher = new TencentStockQuoteFetcher({
      fetchImpl: async () => {
        calls += 1
        return utf8Response('')
      },
    })
    await expect(fetcher.fetchName('bad')).resolves.toBe('')
    await expect(fetcher.fetchName('830799')).resolves.toBe('')
    expect(calls).toBe(0)
  })

  it('uses the 3 second timeout and gives up quietly', async () => {
    expect(QUOTE_TIMEOUT_MS).toBe(3_000)

    const timedOut = new TencentStockQuoteFetcher({
      timeoutMs: 5,
      fetchImpl: (_url, signal) =>
        new Promise<QuoteHttpResponse>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')))
        }),
    })
    await expect(timedOut.fetchQuotes(['600000'])).resolves.toEqual(new Map())
  })

  it('decodes GBK end to end for quotes and names', async () => {
    // 中文名称段用 GBK 字节，其余字段用 ASCII 拼进同一个 payload。
    const nameBytes = Uint8Array.from([0xc6, 0xd6, 0xb7, 0xa2, 0xd2, 0xf8, 0xd0, 0xd0])
    const head = new TextEncoder().encode('v_sh600000="x~')
    const tail = new TextEncoder().encode(
      '~600000~10.20~10.05' + '~-'.repeat(25) + '~20260904150000~-";',
    )
    const payload = concatBytes(head, nameBytes, tail)

    const fetcher = new TencentStockQuoteFetcher({
      fetchImpl: async () => fakeResponse(payload),
    })
    await expect(fetcher.fetchName('600000')).resolves.toBe('浦发银行')

    const quotes = await fetcher.fetchQuotes(['600000'])
    expect(quoteOf(quotes, '600000').latestPrice).toBe(10_200)
  })
})

// ================================================================ 账户总览

describe('stock overview', () => {
  it('includes market value and the current-round unrealized pnl', async () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    seedPosition(workspace, {
      stockCode: '600000',
      quantity: 1_000,
      totalCost: 1_000_510,
    })
    // 建仓 10 手 @ 10.00：成本 = 1000000 + 佣金 500 + 过户费 10 = 1000510
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_OPEN,
      lots: 10,
      price: 10_000,
      amount: 1_000_000,
      fee: 510,
    })

    const overview = await getOverview(
      workspace.db,
      LEDGER,
      quoteFetcher({
        '600000': { latestPrice: 11_000, prevClose: 10_500, quoteTime: 12_345 },
      }),
    )

    expect(overview.principal).toBe(10_000_000)
    expect(overview.availableCash).toBe(10_000_000 - 1_000_510)
    expect(overview.withdrawnTotal).toBe(0)
    expect(overview.interestTotal).toBe(0)
    // 市值 = 最新价（厘）× 股数，落到分
    expect(overview.positionMarketValue).toBe(1_100_000)
    expect(overview.unrealizedPnl).toBe(1_100_000 - 1_000_510)
    expect(overview.realizedPnl).toBe(0)
    expect(overview.quoteFailedCount).toBe(0)
    expect(overview.totalAssets).toBe(overview.availableCash + overview.positionMarketValue)
    // 99.49 / 100 保留两位小数
    expect(overview.totalPnlPercent).toBe(0.99)
    expect(overview.positionRatio).toBe(10.01)
  })

  it('falls back to the position cost when a quote is missing', async () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    seedPosition(workspace, {
      stockCode: '600000',
      quantity: 1_000,
      totalCost: 1_000_510,
    })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_OPEN,
      lots: 10,
      amount: 1_000_000,
      fee: 510,
    })

    const overview = await getOverview(workspace.db, LEDGER, noQuotes())
    expect(overview.quoteFailedCount).toBe(1)
    expect(overview.positionMarketValue).toBe(1_000_510)
    expect(overview.unrealizedPnl).toBe(0)
    expect(overview.totalAssets).toBe(10_000_000)
  })

  it('counts only the positions whose quote failed', async () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    seedPosition(workspace, {
      stockCode: '600000',
      quantity: 1_000,
      totalCost: 1_000_510,
    })
    seedPosition(workspace, {
      stockCode: '000001',
      quantity: 500,
      totalCost: 1_000_500,
    })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_OPEN,
      lots: 10,
      amount: 1_000_000,
      fee: 510,
    })
    seedTrade(workspace, {
      stockCode: '000001',
      tradeType: STOCK_TRADE_OPEN,
      lots: 5,
      amount: 1_000_000,
      fee: 500,
    })

    const fetcher = quoteFetcher({
      '600000': { latestPrice: 11_000, prevClose: 10_500, quoteTime: 12_345 },
    })
    const positions = await listPositions(workspace.db, LEDGER, fetcher)
    expect(positions).toHaveLength(2)
    expect(positionOf(positions, '600000').latestPrice).toBe(11_000)
    expect(positionOf(positions, '000001').latestPrice).toBeUndefined()

    const overview = await getOverview(workspace.db, LEDGER, fetcher)
    expect(overview.quoteFailedCount).toBe(1)
    // 有行情的那只按最新价（厘）计价、缺行情的按成本计入
    const marketValue = 1_100_000
    expect(overview.positionMarketValue).toBe(marketValue + 1_000_500)
    expect(overview.unrealizedPnl).toBe(marketValue - 1_000_510)
    expect(overview.totalAssets).toBe(overview.availableCash + overview.positionMarketValue)
  })

  it('counts the current-round cash flow in the unrealized pnl', async () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 10_000_000)
    seedPosition(workspace, {
      stockCode: '600000',
      quantity: 200,
      totalCost: 220_502,
    })

    // 上一轮：建仓 2 手 → 清仓 2 手（已归档，不计入本轮口径）
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_OPEN,
      lots: 2,
      amount: 200_000,
      fee: 502,
      tradeTime: 1_700_000_000,
    })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_CLOSE,
      lots: 2,
      amount: 400_000,
      fee: 704,
      tradeTime: 1_700_000_100,
    })
    seedSellPnl(workspace, 198_794)
    // 本轮：建仓 2 手 → 加仓 2 手 → 减仓 2 手（未清仓）
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_OPEN,
      lots: 2,
      amount: 200_000,
      fee: 502,
      tradeTime: 1_700_000_200,
    })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_ADD,
      lots: 2,
      amount: 240_000,
      fee: 502,
      tradeTime: 1_700_000_300,
    })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_REDUCE,
      lots: 2,
      amount: 260_000,
      fee: 630,
      tradeTime: 1_700_000_400,
    })

    const fetcher = quoteFetcher({
      '600000': { latestPrice: 11_000, prevClose: 10_500, quoteTime: 12_345 },
    })
    const positions = await listPositions(workspace.db, LEDGER, fetcher)
    expect(positions).toHaveLength(1)
    const position = positions[0]
    expect(position.quantity).toBe(200)

    // 与成交记录里「资金变动」列同一套算法：买入 −(成交额 + 费用)，卖出 成交额 − 费用
    const wantFlow = -(200_000 + 502) - (240_000 + 502) + (260_000 - 630)
    expect(position.roundCashFlow).toBe(wantFlow)

    const marketValue = 220_000 // 11.00 元 × 200 股
    const pnl = marketValue + wantFlow
    // 浮动盈亏率的分母是**本轮净投入**（= −资金变动），不是本轮买入总额
    expect(floatingPnlRate(pnl, position.roundCashFlow)).toBe(21.12)

    const overview = await getOverview(workspace.db, LEDGER, fetcher)
    expect(overview.realizedPnl).toBe(198_794)
    expect(overview.positionMarketValue).toBe(marketValue)
    expect(overview.unrealizedPnl).toBe(pnl)
    expect(overview.unrealizedPnl).not.toBe(marketValue - position.totalCost)
  })

  it('counts settled rounds only as realized pnl', async () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 800_000)

    // 已清仓的一轮：建仓 2 手 → 减仓 1 手 → 清仓 1 手（卖出净额 314239 − 买入成本 307503 = +6736）
    seedPosition(workspace, { stockCode: '600000', quantity: 0, totalCost: 0 })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_OPEN,
      lots: 2,
      amount: 307_000,
      fee: 503,
      tradeTime: 1_700_000_000,
    })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_REDUCE,
      lots: 1,
      amount: 156_700,
      fee: 580,
      tradeTime: 1_700_000_100,
    })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_CLOSE,
      lots: 1,
      amount: 158_700,
      fee: 581,
      tradeTime: 1_700_000_200,
    })

    // 未清仓的一轮：本轮资金变动 −177059，还持有 3 手（剩余成本 158971）
    seedPosition(workspace, { stockCode: '000001', quantity: 300, totalCost: 158_971 })
    seedTrade(workspace, {
      stockCode: '000001',
      tradeType: STOCK_TRADE_OPEN,
      lots: 7,
      amount: 389_200,
      fee: 500,
      tradeTime: 1_700_000_300,
    })
    seedTrade(workspace, {
      stockCode: '000001',
      tradeType: STOCK_TRADE_REDUCE,
      lots: 3,
      amount: 161_700,
      fee: 581,
      tradeTime: 1_700_000_400,
    })
    seedTrade(workspace, {
      stockCode: '000001',
      tradeType: STOCK_TRADE_REDUCE,
      lots: 3,
      amount: 155_400,
      fee: 578,
      tradeTime: 1_700_000_500,
    })
    seedTrade(workspace, {
      stockCode: '000001',
      tradeType: STOCK_TRADE_ADD,
      lots: 2,
      amount: 102_800,
      fee: 500,
      tradeTime: 1_700_000_600,
    })

    // 卖出资金记录上的净盈亏合计 = 已清仓 +6736、未清仓减仓 −18088（现金口径要含后者）
    seedSellPnl(workspace, 6_736)
    seedSellPnl(workspace, -18_088)

    const overview = await getOverview(workspace.db, LEDGER, noQuotes())
    expect(overview.realizedPnl).toBe(6_736)
    expect(overview.unrealizedPnl).toBe(-18_088)
    expect(overview.availableCash).toBe(800_000 + 6_736 - 18_088 - 158_971)
    expect(overview.totalAssets).toBe(788_648)
    expect(overview.realizedPnl + overview.unrealizedPnl).toBe(
      overview.totalAssets - overview.principal,
    )
  })

  it('keeps a flat open round in the floating pnl', async () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 1_000_000)
    seedPosition(workspace, { stockCode: '600000', quantity: 0, totalCost: 0 })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_OPEN,
      lots: 2,
      amount: 200_000,
      fee: 502,
      tradeTime: 1_700_000_000,
    })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_REDUCE,
      lots: 2,
      amount: 220_000,
      fee: 612,
      tradeTime: 1_700_000_100,
    })
    seedSellPnl(workspace, 18_886)

    const overview = await getOverview(workspace.db, LEDGER, noQuotes())
    expect(overview.realizedPnl).toBe(0) // 没清仓就没有已实现盈亏
    expect(overview.unrealizedPnl).toBe(18_886) // 0 手但本轮未归档
    expect(overview.realizedPnl + overview.unrealizedPnl).toBe(
      overview.totalAssets - overview.principal,
    )

    // 0 手但本轮没归档的票仍在持仓列表里，市值按 0 股算
    const positions = await listPositions(workspace.db, LEDGER, noQuotes())
    expect(positions).toHaveLength(1)
    expect(positions[0].quantity).toBe(0)
    expect(positions[0].roundCashFlow).toBe(18_886)
  })

  it('computes the position ratio as invested over capital base', async () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 1_000_000)
    seedPosition(workspace, { stockCode: '600000', quantity: 200, totalCost: 200_502 })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_OPEN,
      lots: 2,
      amount: 200_000,
      fee: 502,
      tradeTime: 1_700_000_000,
    })

    const holding = await getOverview(workspace.db, LEDGER, noQuotes())
    expect(holding.availableCash).toBe(1_000_000 - 200_502)
    expect(holding.positionRatio).toBe(20.05)

    // 清仓 2 手 @11.00：钱回到现金，仓位归零（已实现盈亏不再算进仓位）
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_CLOSE,
      lots: 2,
      amount: 220_000,
      fee: 612,
      tradeTime: 1_700_000_100,
    })
    markPositionClosed(workspace, '600000')
    seedSellPnl(workspace, 18_886)

    const closed = await getOverview(workspace.db, LEDGER, noQuotes())
    expect(closed.realizedPnl).toBe(18_886)
    expect(closed.positionRatio).toBe(0)
  })

  it('has no position ratio when the capital base is gone', async () => {
    const workspace = newWorkspace()
    setPrincipal(workspace.db, LEDGER, 500_000)
    withdraw(workspace.db, LEDGER, 500_000)

    const overview = await getOverview(workspace.db, LEDGER, noQuotes())
    expect(overview.availableCash).toBe(0)
    expect(overview.positionRatio).toBeNull()
    expect(overview.totalPnlPercent).toBe(0)
  })

  it('returns a zeroed overview for an empty account', async () => {
    const workspace = newWorkspace()

    const overview = await getOverview(workspace.db, LEDGER, noQuotes())
    expect(overview).toEqual({
      principal: 0,
      availableCash: 0,
      positionMarketValue: 0,
      withdrawnTotal: 0,
      interestTotal: 0,
      totalAssets: 0,
      realizedPnl: 0,
      unrealizedPnl: 0,
      quoteFailedCount: 0,
      totalPnlPercent: 0,
      positionRatio: null,
    })
  })
})

// ================================================================ 持仓列表

describe('stock positions', () => {
  it('attaches quotes to the listed positions', async () => {
    const workspace = newWorkspace()
    seedPosition(workspace, {
      stockCode: '600000',
      stockName: '浦发银行',
      quantity: 1_000,
      totalCost: 1_000_510,
    })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_OPEN,
      lots: 10,
      amount: 1_000_000,
      fee: 510,
    })

    const items = await listPositions(
      workspace.db,
      LEDGER,
      quoteFetcher({
        '600000': { latestPrice: 11_000, prevClose: 10_500, quoteTime: 12_345 },
      }),
    )
    expect(items).toHaveLength(1)
    expect(items[0].stockName).toBe('浦发银行')
    expect(items[0].latestPrice).toBe(11_000)
    expect(items[0].prevClose).toBe(10_500)
    expect(items[0].quoteTime).toBe(12_345)
    expect(items[0].roundCashFlow).toBe(-1_000_510)
  })

  it('omits quote fields instead of nulling them when the quote fails', async () => {
    const workspace = newWorkspace()
    seedPosition(workspace, { stockCode: '600000', quantity: 100, totalCost: 10_000 })

    const items = await listPositions(workspace.db, LEDGER, noQuotes())
    expect(items).toHaveLength(1)
    expect('latestPrice' in items[0]).toBe(false)
    expect('prevClose' in items[0]).toBe(false)
    expect('quoteTime' in items[0]).toBe(false)
    // 查不到成交（异常数据）时本轮资金口径退回剩余成本
    expect(items[0].roundCashFlow).toBe(-10_000)
  })

  it('saves the position review, rejects long text and closed positions', async () => {
    const workspace = newWorkspace()
    seedPosition(workspace, { stockCode: '600000', quantity: 1_000, totalCost: 1_000_510 })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_OPEN,
      lots: 10,
      amount: 1_000_000,
      fee: 510,
    })

    const updated = updatePositionReview(
      workspace.db,
      LEDGER,
      '600000',
      '  建仓理由：回踩年线企稳，等放量  ',
    )
    expect(updated.review).toBe('建仓理由：回踩年线企稳，等放量')

    const positions = await listPositions(workspace.db, LEDGER, noQuotes())
    expect(positions[0].review).toBe('建仓理由：回踩年线企稳，等放量')

    const tooLong = appError(() =>
      updatePositionReview(workspace.db, LEDGER, '600000', '复'.repeat(501)),
    )
    expect(tooLong.message).toContain('不能超过 500 字')
    expect(tooLong.status).toBe(400)

    // 不存在的持仓 / 空入参
    expect(appError(() => updatePositionReview(workspace.db, LEDGER, '000002', 'x')).message).toBe(
      '持仓不存在',
    )
    expect(appError(() => updatePositionReview(workspace.db, '', '600000', 'x')).message).toBe(
      'ledger_id is required',
    )
    expect(appError(() => updatePositionReview(workspace.db, LEDGER, '', 'x')).message).toBe(
      'stock_code is required',
    )

    // 清仓归档后持仓侧只读：改到「交易历史」里写
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_CLOSE,
      lots: 10,
      amount: 1_200_000,
      fee: 700,
      tradeTime: 1_700_000_100,
    })
    markPositionClosed(workspace, '600000')
    const closed = appError(() =>
      updatePositionReview(workspace.db, LEDGER, '600000', '补写'),
    )
    expect(closed.message).toBe('该股票已清仓，请在「交易历史」中编辑本轮复盘')
    expect(closed.status).toBe(404)
  })

  it('stores the effective position tag and rejects unknown tags', async () => {
    const workspace = newWorkspace()
    seedPosition(workspace, { stockCode: '600000', quantity: 1_000, totalCost: 1_000_510 })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_OPEN,
      lots: 10,
      amount: 1_000_000,
      fee: 510,
    })

    const readRawTag = (): string =>
      (
        workspace.db
          .prepare('SELECT tag FROM stock_position WHERE ledger_id = ? AND stock_code = ?')
          .get(LEDGER, '600000') as { tag: string }
      ).tag

    // 建仓不带标签 ⇒ 库里是空串，列表给的是**生效值**「分析」
    expect(readRawTag()).toBe('')
    let positions = await listPositions(workspace.db, LEDGER, noQuotes())
    expect(positions[0].tag).toBe(STOCK_TAG_ANALYSIS)

    const tagged = updatePositionTag(workspace.db, LEDGER, '600000', STOCK_TAG_DABAN)
    expect(tagged.tag).toBe(STOCK_TAG_DABAN)
    expect(readRawTag()).toBe(STOCK_TAG_DABAN)
    positions = await listPositions(workspace.db, LEDGER, noQuotes())
    expect(positions[0].tag).toBe(STOCK_TAG_DABAN)

    // 非法标签被拒且不落库；空串 = 回到默认
    const invalid = appError(() =>
      updatePositionTag(workspace.db, LEDGER, '600000', '不存在的标签'),
    )
    expect(invalid.message).toBe('无效的交易标签')
    expect(invalid.status).toBe(400)
    expect(readRawTag()).toBe(STOCK_TAG_DABAN)

    const cleared = updatePositionTag(workspace.db, LEDGER, '600000', '   ')
    expect(cleared.tag).toBe(STOCK_TAG_ANALYSIS)
    expect(readRawTag()).toBe(STOCK_TAG_ANALYSIS)

    // 清仓归档后持仓侧只读
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_CLOSE,
      lots: 10,
      amount: 1_200_000,
      fee: 700,
      tradeTime: 1_700_000_100,
    })
    markPositionClosed(workspace, '600000')
    const closed = appError(() =>
      updatePositionTag(workspace.db, LEDGER, '600000', STOCK_TAG_DABAN),
    )
    expect(closed.message).toBe('该股票已清仓，请在「交易历史」中改本轮标签')
    expect(closed.status).toBe(404)
  })

  it('fills the round opened date, round fee and day reviews', async () => {
    const workspace = newWorkspace()
    const roundFee: RoundFee = {
      commissionRate: 0.0003,
      minCommission: 500,
      stampDutyRate: 0.0005,
      transferFeeRate: 0.00001,
    }
    seedPosition(workspace, { stockCode: '600000', quantity: 100, totalCost: 100_502 })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_OPEN,
      lots: 1,
      amount: 100_000,
      fee: 502,
      tradeTime: localDay(2026, 10, 15),
      roundFee,
    })
    seedTrade(workspace, {
      stockCode: '600000',
      tradeType: STOCK_TRADE_ADD,
      shares: 50,
      amount: 55_000,
      fee: 501,
      tradeTime: localDay(2026, 10, 16),
      roundFee,
    })
    seedDayReview(workspace, '600000', '2026-10-15', '第一天')
    seedDayReview(workspace, '600000', '2026-10-16', '第二天')

    // 另一只没成交、没设过费用的票：本轮资金口径退回剩余成本，费用字段省略
    seedPosition(workspace, { stockCode: '000001', quantity: 100, totalCost: 50_000 })

    const positions = await listPositions(workspace.db, LEDGER, noQuotes())

    const withRound = positionOf(positions, '600000')
    expect(withRound.roundOpenedDate).toBe('2026-10-15')
    expect(withRound.roundFee).toEqual(roundFee)
    expect(withRound.dayReviews).toEqual([
      { date: '2026-10-16', review: '第二天' },
      { date: '2026-10-15', review: '第一天' },
    ])
    expect(withRound.roundCashFlow).toBe(-(100_000 + 502) - (55_000 + 501))

    const withoutRound = positionOf(positions, '000001')
    expect(withoutRound.roundOpenedDate).toBe('')
    expect(withoutRound.dayReviews).toEqual([])
    expect('roundFee' in withoutRound).toBe(false)
    expect(withoutRound.roundCashFlow).toBe(-50_000)
  })
})
