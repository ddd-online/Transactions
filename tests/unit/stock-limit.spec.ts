import { afterEach, describe, expect, it } from 'vitest'

import { migrate } from '../../electron/db/migrate'
import { getLimitDay } from '../../electron/db/dao/stock-limit'
import { openDatabase, type Db } from '../../electron/db/driver'
import { buildLimitLadder, isOneWordBoard } from '../../shared/domain/limit-ladder'
import type { StockLimitEntry } from '../../shared/types/stock-limit'
import { EastmoneyLimitPoolSource, parseLimitPoolPayload } from '../../electron/services/stock-limit-pool'
import { getLimitLadder } from '../../electron/services/stock-limit'

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
