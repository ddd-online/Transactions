import { afterEach, describe, expect, it } from 'vitest'

import { migrate } from '../../electron/db/migrate'
import { getLimitDay } from '../../electron/db/dao/stock-limit'
import { openDatabase, type Db } from '../../electron/db/driver'
import {
  boardCounts,
  buildLimitLadder,
  isOneWordBoard,
  ladderRows,
  type LadderRow,
} from '../../shared/domain/limit-ladder'
import type {
  StockLimitBrokenEntry,
  StockLimitEntry,
  StockLimitRung,
} from '../../shared/types/stock-limit'
import type { StockQuoteDto } from '../../shared/types/stock-position'
import { EastmoneyLimitPoolSource, parseLimitPoolPayload } from '../../electron/services/stock-limit-pool'
import { getLimitLadder } from '../../electron/services/stock-limit'
import type { StockQuoteFetcher } from '../../electron/services/stock-quote'

const openDbs: Db[] = []

function database(): Db {
  const db = openDatabase(':memory:')
  migrate(db, ':memory:')
  openDbs.push(db)
  return db
}

afterEach(() => {
  for (const db of openDbs.splice(0)) db.close()
})

/** 本地时间 → Unix 秒。 */
function at(year: number, month: number, day: number, hour: number, minute = 0): number {
  return Math.trunc(new Date(year, month - 1, day, hour, minute).getTime() / 1000)
}

function entry(stockCode: string, level: number, firstSeal: number, name = stockCode): StockLimitEntry {
  return {
    stockCode,
    stockName: name,
    market: 1,
    priceMilli: 11000,
    pct: 10,
    amountCents: 100,
    floatMvCents: 200,
    turnover: 3.5,
    level,
    firstSeal,
    lastSeal: firstSeal,
    brokenCount: 0,
    sealFundCents: 300,
    industry: '银行',
    statDays: level,
    statCount: level,
  }
}

const PAYLOAD = JSON.stringify({
  rc: 0,
  data: {
    tc: 2,
    qdate: 20261027,
    pool: [
      {
        c: '600838',
        m: 1,
        n: '上海九百',
        p: 11000,
        zdp: 10.0,
        amount: 234953015,
        ltsz: 4409701791.0,
        hs: 5.3280930519104,
        lbc: 4,
        fbt: 92500,
        lbt: 150000,
        zbc: 1,
        fund: 109301885,
        hybk: '一般零售',
        zttj: { days: 4, ct: 4 },
      },
      { c: '000001', m: 0, n: '平安银行', p: 12000, zdp: 9.99, lbc: 1, fbt: 93000 },
      { c: 'bad', n: '非法', lbc: 2 },
      { c: '600838', n: '重复', lbc: 4 },
    ],
  },
})

describe('parseLimitPoolPayload', () => {
  it('把东财字段换算成天梯条目', () => {
    const entries = parseLimitPoolPayload(PAYLOAD)
    expect(entries).not.toBeNull()
    expect(entries).toHaveLength(2)

    const first = entries![0]
    expect(first.stockCode).toBe('600838')
    expect(first.stockName).toBe('上海九百')
    expect(first.priceMilli).toBe(11000)
    expect(first.amountCents).toBe(23_495_301_500)
    expect(first.floatMvCents).toBe(440_970_179_100)
    expect(first.turnover).toBe(5.33)
    expect(first.level).toBe(4)
    expect(first.firstSeal).toBe(92500)
    expect(first.brokenCount).toBe(1)
    expect(first.industry).toBe('一般零售')
    expect(first.statDays).toBe(4)
    expect(first.statCount).toBe(4)
  })

  it('去掉非法代码与重复代码，缺字段按 0 / 首板兜底', () => {
    const entries = parseLimitPoolPayload(PAYLOAD)!
    const second = entries.find((row) => row.stockCode === '000001')!
    expect(second.level).toBe(1)
    expect(second.amountCents).toBe(0)
    expect(second.industry).toBe('')
    expect(entries.map((row) => row.stockCode)).toEqual(['600838', '000001'])
  })

  it('业务错误码与坏 JSON 都返回 null', () => {
    expect(parseLimitPoolPayload('{"rc":102,"data":null}')).toBeNull()
    expect(parseLimitPoolPayload('not json')).toBeNull()
  })
})

describe('buildLimitLadder', () => {
  const today = [entry('A', 2, 93000), entry('B', 1, 93100), entry('C', 3, 92500), entry('D', 1, 92500)]
  const previous = [entry('A', 1, 93000), entry('C', 2, 92500), entry('E', 1, 94000), entry('F', 2, 94100)]

  it('按板数升序分层，并算出每层晋级率', () => {
    const { rungs } = buildLimitLadder(today, previous)
    expect(rungs.map((rung) => rung.level)).toEqual([1, 2, 3])
    expect(rungs[0].entries.map((row) => row.stockCode)).toEqual(['D', 'B'])
    expect(rungs[0].candidates).toBeNull()
    expect(rungs[1].candidates).toBe(2)
    expect(rungs[1].rate).toBe(50)
    expect(rungs[2].candidates).toBe(2)
    expect(rungs[2].rate).toBe(50)
  })

  it('断板挂在昨日所在的那一层，排在连板股后面', () => {
    const { rungs } = buildLimitLadder(today, previous)
    expect(rungs[0].broken.map((row) => row.stockCode)).toEqual(['E'])
    expect(rungs[1].broken.map((row) => row.stockCode)).toEqual(['F'])
    expect(rungs[2].broken).toEqual([])
  })

  it('昨日那一层全部晋级时，不留下空列', () => {
    const promoted = [...previous, entry('Y', 5, 95000)]
    const nextDay = [...today, entry('Y', 6, 95000)]
    const { rungs } = buildLimitLadder(nextDay, promoted)
    expect(rungs.map((rung) => rung.level)).toEqual([1, 2, 3, 6])
    expect(rungs.find((rung) => rung.level === 5)).toBeUndefined()
  })

  it('昨日有、今日没有的层也保留，只放断板', () => {
    const { rungs, metrics } = buildLimitLadder(today, [...previous, entry('X', 4, 95000)])
    const top = rungs.find((rung) => rung.level === 4)!
    expect(top.entries).toEqual([])
    expect(top.broken.map((row) => row.stockCode)).toEqual(['X'])
    // 空间板仍只算今日
    expect(metrics.maxLevel).toBe(3)
  })

  it('汇总指标', () => {
    const { metrics } = buildLimitLadder(today, previous)
    expect(metrics).toEqual({
      limitCount: 4,
      previousCount: 4,
      maxLevel: 3,
      promotedCount: 2,
      rate: 50,
      brokenCount: 2,
    })
  })

  it('缺前一交易日时晋级率与断板都留空', () => {
    const { rungs, metrics } = buildLimitLadder(today, null)
    expect(rungs.every((rung) => rung.broken.length === 0)).toBe(true)
    expect(rungs.every((rung) => rung.rate === null && rung.candidates === null)).toBe(true)
    expect(metrics.previousCount).toBeNull()
    expect(metrics.rate).toBeNull()
    expect(metrics.brokenCount).toBeNull()
    expect(metrics.maxLevel).toBe(3)
  })
})

describe('isOneWordBoard', () => {
  it('09:25 封死且没炸过板才算一字板', () => {
    expect(isOneWordBoard(entry('Z', 1, 92500))).toBe(true)
    expect(isOneWordBoard({ ...entry('Z', 1, 92500), brokenCount: 1 })).toBe(false)
    expect(isOneWordBoard(entry('Z', 1, 92501))).toBe(false)
  })
})

describe('ladderRows', () => {
  function board(code: string, seal: number, industry: string): StockLimitEntry {
    return { ...entry(code, 1, seal), industry }
  }

  function brokenOf(row: StockLimitEntry): StockLimitBrokenEntry {
    return { ...row, todayPct: null }
  }

  function rung(entries: StockLimitEntry[], broken: StockLimitBrokenEntry[]): StockLimitRung {
    return { level: 1, entries, broken, candidates: null, rate: null }
  }

  /** `连A` / `断B`：一眼看出行序与连板/断板身份。 */
  function rowOrder(rows: LadderRow[]): string[] {
    return rows.map((row) => `${row.broken ? '断' : '连'}${row.entry.stockCode}`)
  }

  it('先按板块聚在一起，板块内连板在前、断板在后', () => {
    const rows = ladderRows(
      rung(
        [board('A', 92500, '电网设备'), board('B', 92600, '化学制药'), board('C', 92700, '电网设备')],
        [brokenOf(board('D', 92800, '电网设备')), brokenOf(board('E', 92900, '白酒'))],
      ),
    )
    // 电网设备（最早 09:25）→ A、C、D；化学制药 → B；白酒今天没人晋级，整组在最后
    expect(rowOrder(rows)).toEqual(['连A', '连C', '断D', '连B', '断E'])
  })

  it('按板块分组后，板块内仍按封板先后', () => {
    const rows = ladderRows(
      rung(
        [
          board('A', 93100, '光伏设备'),
          board('B', 93000, '光伏设备'),
          board('C', 93200, '光伏设备'),
        ],
        [],
      ),
    )
    expect(rowOrder(rows)).toEqual(['连B', '连A', '连C'])
  })

  it('只剩断板的板块整组排在后面，昨日封板不参与今天的先后', () => {
    const rows = ladderRows(
      rung([board('A', 93000, '银行')], [brokenOf(board('Z', 92500, '白酒'))]),
    )
    expect(rowOrder(rows)).toEqual(['连A', '断Z'])
  })

  it('没有板块字段的行归到兜底组，排在最后', () => {
    const rows = ladderRows(rung([board('A', 92500, ''), board('B', 93000, '银行')], []))
    expect(rowOrder(rows)).toEqual(['连B', '连A'])
  })
})

describe('boardCounts', () => {
  function withBoard(code: string, industry: string): StockLimitEntry {
    return { ...entry(code, 1, 92500), industry }
  }

  it('按板块数涨停家数，家数多的在前，同数按名字排', () => {
    const counts = boardCounts([
      withBoard('A', '电网设备'),
      withBoard('B', '化学制药'),
      withBoard('C', '电网设备'),
      withBoard('D', '电网设备'),
      withBoard('E', '银行'),
    ])
    expect(counts).toEqual([
      { board: '电网设备', count: 3 },
      { board: '化学制药', count: 1 },
      { board: '银行', count: 1 },
    ])
  })

  it('没有板块字段的老数据不占一格', () => {
    expect(boardCounts([withBoard('A', '  ')])).toEqual([])
  })
})

describe('getLimitLadder 缓存纪律', () => {
  /** 按日期返回固定池子，并记录每次请求。 */
  function source(pools: Record<string, StockLimitEntry[]>): {
    calls: string[]
    fetchDay: (date: string) => Promise<StockLimitEntry[]>
  } {
    const calls: string[] = []
    return {
      calls,
      async fetchDay(date: string) {
        calls.push(date)
        return pools[date] ?? []
      },
    }
  }

  const pools = {
    '2026-10-23': [entry('A', 2, 92500), entry('B', 1, 92600)],
    '2026-10-22': [entry('A', 1, 92500), entry('C', 1, 93000)],
    '2026-10-26': [entry('A', 3, 92500)], // 周一
    '2026-10-27': [entry('A', 4, 92500), entry('D', 1, 93500)],
  }

  it('首次抓取会连前一日一起入库，之后只读库', async () => {
    const db = database()
    const stub = source(pools)
    const now = at(2026, 10, 27, 16)

    const first = await getLimitLadder(db, stub, '2026-10-23', { now })
    expect(first.status).toBe('ok')
    expect(first.previousDate).toBe('2026-10-22')
    expect(first.temporary).toBe(false)
    expect(first.metrics.rate).toBe(50)
    expect(stub.calls).toEqual(['2026-10-23', '2026-10-22'])
    expect(getLimitDay(db, '2026-10-23')?.status).toBe('ok')
    expect(getLimitDay(db, '2026-10-22')?.status).toBe('ok')

    const second = await getLimitLadder(db, stub, '2026-10-23', { now })
    expect(second.metrics.limitCount).toBe(2)
    expect(stub.calls).toEqual(['2026-10-23', '2026-10-22'])
  })

  it('前一天是周末：跳过周末，和上周五对比', async () => {
    const db = database()
    const stub = source({
      '2026-10-12': [entry('A', 2, 92500)],
      '2026-10-09': [entry('A', 1, 92500), entry('B', 1, 93000)],
    })

    const ladder = await getLimitLadder(db, stub, '2026-10-12', { now: at(2026, 10, 12, 16) })
    expect(ladder.previousDate).toBe('2026-10-09')
    expect(ladder.metrics.previousCount).toBe(2)
    expect(stub.calls).not.toContain('2026-10-10')
    expect(stub.calls).not.toContain('2026-10-11')
    expect(getLimitDay(db, '2026-10-10')?.status).toBe('empty')
  })

  it('前一天是节假日：回溯到上一个交易日，并缓存空日', async () => {
    const db = database()
    const stub = source({
      '2026-10-09': [entry('A', 2, 92500)],
      '2026-09-30': [entry('A', 1, 92500), entry('C', 1, 93000)],
    })

    const ladder = await getLimitLadder(db, stub, '2026-10-09', { now: at(2026, 10, 9, 16) })
    expect(ladder.previousDate).toBe('2026-09-30')
    expect(ladder.metrics.previousCount).toBe(2)
    expect(ladder.metrics.promotedCount).toBe(1)
    expect(getLimitDay(db, '2026-10-08')?.status).toBe('empty')

    // 节假日探过一次就落库：再看同一天不再发请求
    const calls = stub.calls.length
    await getLimitLadder(db, stub, '2026-10-09', { now: at(2026, 10, 9, 16) })
    expect(stub.calls.length).toBe(calls)
  })

  it('当天 09:30 前不支持查看：不发请求、不写库', async () => {
    const db = database()
    const stub = source(pools)
    const early = at(2026, 10, 27, 9)

    const ladder = await getLimitLadder(db, stub, '2026-10-27', { now: early })
    expect(ladder.status).toBe('preopen')
    expect(ladder.rungs).toEqual([])
    expect(stub.calls).toEqual([])
    expect(getLimitDay(db, '2026-10-27')).toBeNull()

    // 09:30 一到就进入盘中快照
    const atOpen = await getLimitLadder(db, stub, '2026-10-27', { now: at(2026, 10, 27, 9, 30) })
    expect(atOpen.temporary).toBe(true)
    expect(stub.calls).toContain('2026-10-27')
  })

  it('15:00 前抓当天只渲染，不写库；收盘后才入库', async () => {
    const db = database()
    const stub = source(pools)
    const morning = at(2026, 10, 27, 10)

    const live = await getLimitLadder(db, stub, '2026-10-27', { now: morning })
    expect(live.status).toBe('ok')
    expect(live.temporary).toBe(true)
    expect(getLimitDay(db, '2026-10-27')).toBeNull()

    // 再进一次仍是临时数据，仍然要重新抓当天
    await getLimitLadder(db, stub, '2026-10-27', { now: morning })
    expect(stub.calls.filter((date) => date === '2026-10-27')).toHaveLength(2)

    const evening = at(2026, 10, 27, 16)
    const settled = await getLimitLadder(db, stub, '2026-10-27', { now: evening })
    expect(settled.temporary).toBe(false)
    expect(getLimitDay(db, '2026-10-27')?.status).toBe('ok')

    const callsBefore = stub.calls.length
    await getLimitLadder(db, stub, '2026-10-27', { now: evening })
    expect(stub.calls.length).toBe(callsBefore)
  })

  it('拒绝未来日期', async () => {
    const db = database()
    await expect(
      getLimitLadder(db, source(pools), '2026-10-28', { now: at(2026, 10, 27, 16) }),
    ).rejects.toThrow(/未来/)
  })

  it('早于数据源窗口且无缓存时返回 unavailable，且不写空标记', async () => {
    const db = database()
    const ladder = await getLimitLadder(db, source(pools), '2026-08-03', { now: at(2026, 10, 27, 16) })
    expect(ladder.status).toBe('unavailable')
    expect(ladder.rungs).toEqual([])
    expect(getLimitDay(db, '2026-08-03')).toBeNull()
  })

  it('刷新失败时退回已有缓存并标记 stale', async () => {
    const db = database()
    const stub = source(pools)
    const now = at(2026, 10, 27, 16)
    await getLimitLadder(db, stub, '2026-10-23', { now })

    const failing = {
      async fetchDay(): Promise<StockLimitEntry[]> {
        throw new Error('断网')
      },
    }
    const ladder = await getLimitLadder(db, failing, '2026-10-23', { now, refresh: true })
    expect(ladder.stale).toBe(true)
    expect(ladder.metrics.limitCount).toBe(2)
  })
})

describe('getLimitLadder 断板涨跌幅', () => {
  /** 按代码返回行情的桩；`calls` 记录每次请求的代码。 */
  function quotes(
    entries: Record<string, { latest: number; prevClose: number; quoteDate: string }>,
  ): StockQuoteFetcher & { calls: string[][] } {
    const calls: string[][] = []
    return {
      calls,
      async fetchQuotes(codes: readonly string[]): Promise<Map<string, StockQuoteDto>> {
        calls.push([...codes])
        const result = new Map<string, StockQuoteDto>()
        for (const code of codes) {
          const hit = entries[code]
          if (!hit) continue
          result.set(code, {
            stockCode: code,
            latestPrice: hit.latest,
            prevClose: hit.prevClose,
            quoteTime: 0,
            quoteDate: hit.quoteDate,
          })
        }
        return result
      },
      async fetchName() {
        return ''
      },
    }
  }

  const pools = {
    '2026-10-23': [entry('A', 2, 92500), entry('B', 1, 92600)],
    '2026-10-22': [entry('A', 1, 92500), entry('C', 1, 93000)],
  }
  const day = '2026-10-23'
  const now = at(2026, 10, 23, 16)

  function ladderSource(): { fetchDay: (date: string) => Promise<StockLimitEntry[]> } {
    return {
      async fetchDay(date: string) {
        return pools[date as keyof typeof pools] ?? []
      },
    }
  }

  it('断板用当天行情补上涨跌幅', async () => {
    const db = database()
    const fetcher = quotes({ C: { latest: 145_000, prevClose: 150_000, quoteDate: day } })
    const ladder = await getLimitLadder(db, ladderSource(), day, { now, quotes: fetcher })

    expect(fetcher.calls).toEqual([['C']])
    const rung = ladder.rungs.find((item) => item.level === 1)!
    expect(rung.broken.map((row) => [row.stockCode, row.todayPct])).toEqual([['C', -3.33]])
    // 连板股不带这个字段的语义：它们本来就在涨停池里，pct 是昨天的涨停幅度。
    expect(rung.entries[0]).not.toHaveProperty('todayPct')
  })

  it('行情日期对不上就不贴：那不是这一天的涨跌', async () => {
    const db = database()
    const fetcher = quotes({ C: { latest: 145_000, prevClose: 150_000, quoteDate: '2026-10-22' } })
    const ladder = await getLimitLadder(db, ladderSource(), day, { now, quotes: fetcher })

    const rung = ladder.rungs.find((item) => item.level === 1)!
    expect(rung.broken[0].todayPct).toBeNull()
  })

  it('太旧的日期不去请求行情', async () => {
    const db = database()
    const fetcher = quotes({ C: { latest: 145_000, prevClose: 150_000, quoteDate: day } })
    await getLimitLadder(db, ladderSource(), '2026-10-12', {
      now: at(2026, 10, 27, 16),
      quotes: fetcher,
    })
    expect(fetcher.calls).toEqual([])
  })

  it('行情失败不影响天梯本身', async () => {
    const db = database()
    const failing: StockQuoteFetcher = {
      async fetchQuotes() {
        throw new Error('行情挂了')
      },
      async fetchName() {
        return ''
      },
    }
    const ladder = await getLimitLadder(db, ladderSource(), day, { now, quotes: failing })
    const rung = ladder.rungs.find((item) => item.level === 1)!
    expect(rung.broken[0].stockCode).toBe('C')
    expect(rung.broken[0].todayPct).toBeNull()
  })
})

describe('EastmoneyLimitPoolSource', () => {
  it('拼出带 ut / date 的请求并解析响应', async () => {
    const urls: string[] = []
    const source = new EastmoneyLimitPoolSource({
      baseUrl: 'http://127.0.0.1:1',
      fetchImpl: async (url) => {
        urls.push(url)
        return {
          ok: true,
          status: 200,
          async arrayBuffer() {
            return new TextEncoder().encode(PAYLOAD).buffer
          },
        }
      },
    })
    const entries = await source.fetchDay('2026-10-23')
    expect(entries).toHaveLength(2)
    expect(urls[0]).toContain('date=20261023')
    expect(urls[0]).toContain('ut=')
    expect(urls[0]).toContain('pagesize=1000')
  })

  it('HTTP 失败抛错，便于服务层区分"没数据"', async () => {
    const source = new EastmoneyLimitPoolSource({
      baseUrl: 'http://127.0.0.1:1',
      fetchImpl: async () => ({ ok: false, status: 502, arrayBuffer: async () => new ArrayBuffer(0) }),
    })
    await expect(source.fetchDay('2026-10-23')).rejects.toThrow(/HTTP 502/)
  })
})
