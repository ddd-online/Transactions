import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace, type OpenedWorkspace } from '../../electron/db'
import {
  createFundRecord,
  deleteTradeFundRecords,
  getFundRecord,
  latestOperation,
  listAllFundRecords,
  listTradeFundLedgerIds,
  queryLatestFundRecord,
} from '../../electron/db/dao/stock-fund'
import {
  addInterest,
  addInterestAtDate,
  addPrincipal,
  addPrincipalAtDate,
  getAccountSummary,
  getOrCreateAccount,
  getOrCreateFeeSetting,
  getReviewTemplate,
  getTradeTags,
  getTradeTagsDto,
  listFundRecords,
  listOperations,
  normalizeStockRecordDate,
  recalculateCashChain,
  saveFeeSettings,
  saveReviewTemplate,
  saveTradeTags,
  setPrincipal,
  unixToDate,
  validateFeeSetting,
  withdraw,
  withdrawAtDate,
} from '../../electron/services/stock-account'
import {
  STOCK_EVENT_ADD_PRINCIPAL,
  STOCK_EVENT_BUY,
  STOCK_EVENT_INTEREST_PRINCIPAL,
  STOCK_EVENT_SELL,
  STOCK_EVENT_WITHDRAW,
  STOCK_REVIEW_TEMPLATE_DEFAULT,
  STOCK_REVIEW_TEMPLATE_MAX_CHARS,
  STOCK_TAG_ANALYSIS,
  STOCK_TAG_DABAN,
  STOCK_TAG_XULI,
  defaultStockTradeTags,
} from '../../shared/domain/consts'
import { todayYmd } from '../../shared/domain/time'
import { AppError } from '../../shared/errors'
import type { StockFundRecord } from '../../shared/types/stock'

const LEDGER = 'ledger-under-test'
const OTHER_LEDGER = 'other-ledger'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-stock-account-test-'))
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

function seedPrincipal(workspace: OpenedWorkspace, amount: number): void {
  setPrincipal(workspace.db, LEDGER, amount)
}

/** 直接种一条资金记录（本切片不拥有建仓 / 清仓，用 DAO 复刻旧测试里的买卖流水）。 */
function seedFundRecord(
  workspace: OpenedWorkspace,
  fields: Partial<StockFundRecord> & Pick<StockFundRecord, 'recordDate' | 'eventType'>,
): StockFundRecord {
  const record: StockFundRecord = {
    id: fields.id ?? `fund-${Math.random().toString(36).slice(2)}`,
    ledgerId: LEDGER,
    recordDate: fields.recordDate,
    eventType: fields.eventType,
    eventText: fields.eventText ?? '',
    amountChange: fields.amountChange ?? 0,
    cashBalance: 0,
    netPnl: fields.netPnl ?? null,
    remark: fields.remark ?? '',
    createdAt: 0,
  }
  createFundRecord(workspace.db, record)
  return record
}

/** 直接种一行持仓（只用于「可用现金扣持仓成本」的汇总口径）。 */
function seedPosition(workspace: OpenedWorkspace, quantity: number, totalCost: number): void {
  workspace.db
    .prepare(
      'INSERT INTO stock_position (id, ledger_id, stock_code, stock_name, quantity, ' +
        'total_cost_cents, realized_pnl_cents, review, created_at, updated_at, tag) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run('position-1', LEDGER, '600519', '贵州茅台', quantity, totalCost, 0, '', 1, 1, '')
}

describe('stock account / settings / fund slice', () => {
  it('get-or-create account creates one default row and is idempotent', () => {
    const workspace = newWorkspace()

    const account = getOrCreateAccount(workspace.db, LEDGER)
    expect(account.ledgerId).toBe(LEDGER)
    expect(account.principal).toBe(0)
    expect(account.createdAt).toBeGreaterThan(0)
    expect(account.updatedAt).toBe(account.createdAt)

    const again = getOrCreateAccount(workspace.db, LEDGER)
    expect(again.id).toBe(account.id)
    expect(again.principal).toBe(0)
  })

  it('get-or-create fee setting returns the defaults and keeps one row per ledger', () => {
    const workspace = newWorkspace()

    const defaults = getOrCreateFeeSetting(workspace.db, LEDGER)
    expect(defaults.commissionRate).toBe(0.0002354)
    expect(defaults.minCommission).toBe(500)
    expect(defaults.stampDutyRate).toBe(0.0005)
    expect(defaults.transferFeeRate).toBe(0.00001)
    expect(defaults.createdAt).toBeGreaterThan(0)

    const again = getOrCreateFeeSetting(workspace.db, LEDGER)
    expect(again.id).toBe(defaults.id)

    const other = getOrCreateFeeSetting(workspace.db, OTHER_LEDGER)
    expect(other.id).not.toBe(defaults.id)
    expect(other.ledgerId).toBe(OTHER_LEDGER)
  })

  it('fee settings round-trip and reject invalid parameters', () => {
    const workspace = newWorkspace()

    const defaults = getOrCreateFeeSetting(workspace.db, LEDGER)
    expect(defaults.minCommission).toBe(500)

    // 佣金费率必须为正；最低佣金不能为负
    expect(
      appError(() =>
        saveFeeSettings(workspace.db, LEDGER, {
          commissionRate: 0,
          minCommission: 500,
          stampDutyRate: 0.0005,
          transferFeeRate: 0.00001,
        }),
      ).status,
    ).toBe(400)
    expect(
      appError(() =>
        saveFeeSettings(workspace.db, LEDGER, {
          commissionRate: 0.0001,
          minCommission: -1,
          stampDutyRate: 0.0005,
          transferFeeRate: 0.00001,
        }),
      ).status,
    ).toBe(400)
    expect(
      appError(() =>
        validateFeeSetting({
          commissionRate: 0.0001,
          minCommission: 0,
          stampDutyRate: -0.0001,
          transferFeeRate: 0,
        }),
      ).message,
    ).toContain('佣金费率必须大于 0')

    const saved = saveFeeSettings(workspace.db, LEDGER, {
      commissionRate: 0.0003,
      minCommission: 1000,
      stampDutyRate: 0.001,
      transferFeeRate: 0.00002,
    })
    expect(saved.commissionRate).toBe(0.0003)
    expect(saved.minCommission).toBe(1000)
    expect(saved.stampDutyRate).toBe(0.001)
    expect(saved.transferFeeRate).toBe(0.00002)

    const reloaded = getOrCreateFeeSetting(workspace.db, LEDGER)
    expect(reloaded.commissionRate).toBe(0.0003)
    expect(reloaded.minCommission).toBe(1000)
  })

  it('trade tag settings default to the five ordered tags', () => {
    const workspace = newWorkspace()

    const setting = getTradeTagsDto(workspace.db, LEDGER)
    expect(setting.defaultTag).toBe(STOCK_TAG_ANALYSIS)
    expect(setting.tags).toEqual(defaultStockTradeTags())
    expect(setting.tags).toEqual(['分析', '打板', '尾盘', '追涨', '蓄力'])
  })

  it('save trade tags trims, preserves order and validates every rule', () => {
    const workspace = newWorkspace()

    const saved = saveTradeTags(workspace.db, LEDGER, [
      STOCK_TAG_ANALYSIS,
      STOCK_TAG_DABAN,
      STOCK_TAG_XULI,
      '低吸',
    ])
    expect(saved.tags).toEqual(['分析', '打板', '蓄力', '低吸'])
    expect(getTradeTags(workspace.db, LEDGER)).toHaveLength(4)

    // 去首尾空白
    const trimmed = saveTradeTags(workspace.db, LEDGER, [STOCK_TAG_ANALYSIS, ' 蓄力 '])
    expect(trimmed.tags[1]).toBe(STOCK_TAG_XULI)

    const invalid: Array<{ name: string; tags: string[]; want: string }> = [
      { name: '空列表', tags: [], want: '至少保留一个标签' },
      { name: '删除默认标签', tags: [STOCK_TAG_DABAN], want: '「分析」不可删除' },
      { name: '重复标签', tags: [STOCK_TAG_ANALYSIS, STOCK_TAG_ANALYSIS], want: '标签不能重复' },
      {
        name: '超长标签',
        tags: [STOCK_TAG_ANALYSIS, '涨停板接力战法九字'],
        want: '不能超过 8 个字',
      },
    ]
    for (const item of invalid) {
      const error = appError(() => saveTradeTags(workspace.db, LEDGER, item.tags))
      expect(error.message, `${item.name} 错误文案错误`).toContain(item.want)
      expect(error.status).toBe(400)
    }

    const tooMany = [STOCK_TAG_ANALYSIS]
    for (let index = 0; index < 20; index += 1) {
      tooMany.push(`自定义${String.fromCharCode('A'.charCodeAt(0) + index)}`)
    }
    expect(appError(() => saveTradeTags(workspace.db, LEDGER, tooMany)).message).toContain(
      '不能超过 20 个',
    )

    // 空账本 id 先被拦下
    expect(appError(() => saveTradeTags(workspace.db, '', [STOCK_TAG_ANALYSIS])).message).toBe(
      'ledger_id is required',
    )
  })

  it('get trade tags falls back to defaults and repairs broken storage', () => {
    const workspace = newWorkspace()
    getTradeTags(workspace.db, LEDGER)

    workspace.db
      .prepare('UPDATE stock_trade_tag_setting SET tags = ? WHERE ledger_id = ?')
      .run('', LEDGER)
    expect(getTradeTags(workspace.db, LEDGER)).toEqual(defaultStockTradeTags())
    let row = workspace.db
      .prepare('SELECT tags FROM stock_trade_tag_setting WHERE ledger_id = ?')
      .get(LEDGER) as { tags: string }
    expect(JSON.parse(row.tags)).toEqual(defaultStockTradeTags())

    workspace.db
      .prepare('UPDATE stock_trade_tag_setting SET tags = ? WHERE ledger_id = ?')
      .run('not-json', LEDGER)
    expect(getTradeTags(workspace.db, LEDGER)).toEqual(defaultStockTradeTags())
    row = workspace.db
      .prepare('SELECT tags FROM stock_trade_tag_setting WHERE ledger_id = ?')
      .get(LEDGER) as { tags: string }
    expect(JSON.parse(row.tags)).toEqual(defaultStockTradeTags())
  })

  it('review template falls back to builtin, is per ledger and caps at 200 chars', () => {
    const workspace = newWorkspace()

    expect(getReviewTemplate(workspace.db, LEDGER)).toBe(STOCK_REVIEW_TEMPLATE_DEFAULT)

    const custom = '判断层：\n买入理由：\n改进层：\n心得：'
    expect(saveReviewTemplate(workspace.db, LEDGER, custom)).toBe(custom)
    expect(getReviewTemplate(workspace.db, LEDGER)).toBe(custom)

    // 全空白 = 清除自定义（写回空串，读出来仍是内置）
    expect(saveReviewTemplate(workspace.db, LEDGER, '   ')).toBe(STOCK_REVIEW_TEMPLATE_DEFAULT)
    expect(getReviewTemplate(workspace.db, LEDGER)).toBe(STOCK_REVIEW_TEMPLATE_DEFAULT)
    const stored = workspace.db
      .prepare('SELECT template FROM stock_review_setting WHERE ledger_id = ?')
      .get(LEDGER) as { template: string }
    expect(stored.template).toBe('')

    // 上限 200 字（Unicode 码点）；201 被拒
    const error = appError(() =>
      saveReviewTemplate(workspace.db, LEDGER, '复'.repeat(STOCK_REVIEW_TEMPLATE_MAX_CHARS + 1)),
    )
    expect(error.message).toContain('复盘模板不能超过')
    expect(error.status).toBe(400)
    const atLimit = '复'.repeat(STOCK_REVIEW_TEMPLATE_MAX_CHARS)
    expect(saveReviewTemplate(workspace.db, LEDGER, atLimit)).toBe(atLimit)

    // 按账本：另一个账本仍是内置模板
    expect(getReviewTemplate(workspace.db, OTHER_LEDGER)).toBe(STOCK_REVIEW_TEMPLATE_DEFAULT)
    expect(appError(() => saveReviewTemplate(workspace.db, '', 'x')).message).toBe(
      'ledger_id is required',
    )
  })

  it('set principal requires a positive amount and rejects once fund records exist', () => {
    const workspace = newWorkspace()

    expect(appError(() => setPrincipal(workspace.db, LEDGER, 0)).message).toBe('本金必须大于 0')
    expect(appError(() => setPrincipal(workspace.db, LEDGER, -1)).status).toBe(400)

    seedPrincipal(workspace, 1_000_000)
    withdraw(workspace.db, LEDGER, 10_000)

    const error = appError(() => setPrincipal(workspace.db, LEDGER, 2_000_000))
    expect(error.message).toBe('已有资金变化记录，请使用「追加本金」')
    expect(error.status).toBe(409)
  })

  it('add principal raises the principal and writes the fund/operation records', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 10_000_000)

    const summary = addPrincipalAtDate(workspace.db, LEDGER, 1_000_000, '2026-01-05')
    expect(summary.principal).toBe(11_000_000)
    expect(summary.availableCash).toBe(11_000_000)

    const page = listFundRecords(workspace.db, LEDGER, 1, 10)
    expect(page.total).toBe(1)
    expect(page.items[0]).toMatchObject({
      recordDate: '2026-01-05',
      eventType: STOCK_EVENT_ADD_PRINCIPAL,
      eventText: '追加本金',
      amountChange: 1_000_000,
      cashBalance: 11_000_000,
      netPnl: null,
      remark: '本金 100000.00 → 110000.00',
    })

    const operation = latestOperation(workspace.db, LEDGER)
    expect(operation).not.toBeNull()
    expect(operation?.kind).toBe('fund')
    expect(operation?.action).toBe('追加本金')
    expect(operation?.detail).toBe('¥10000.00')
    expect(operation?.targetId).toBe(page.items[0].id)
    expect(getFundRecord(workspace.db, operation?.targetId ?? '')).not.toBeNull()
  })

  it('withdrawing implements the total-assets formula and its fund record', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 10_000_000)

    // 本切片不拥有建仓 / 清仓：用资金流水复刻「买入成本 1000510、卖出净额 1198888」。
    seedFundRecord(workspace, {
      id: 'buy-1',
      recordDate: '2026-01-02',
      eventType: 'buy',
      eventText: '买入',
      amountChange: -1_000_510,
    })
    seedFundRecord(workspace, {
      id: 'sell-1',
      recordDate: '2026-01-03',
      eventType: STOCK_EVENT_SELL,
      eventText: '卖出',
      amountChange: 1_198_888,
      netPnl: 198_378,
    })
    recalculateCashChain(workspace.db, LEDGER)

    const before = getAccountSummary(workspace.db, LEDGER)
    expect(before.sellNetPnlTotal).toBe(198_378)
    expect(before.availableCash).toBe(10_198_378)
    expect(before.availableCash).toBe(
      before.principal + before.sellNetPnlTotal + before.interestTotal - before.withdrawnTotal,
    )

    const after = withdraw(workspace.db, LEDGER, 200_000)
    expect(after.principal).toBe(before.principal)
    expect(after.withdrawnTotal).toBe(200_000)
    expect(after.availableCash).toBe(before.availableCash - 200_000)
    expect(after.availableCash).toBe(
      after.principal + after.sellNetPnlTotal + after.interestTotal - after.withdrawnTotal,
    )

    // 资金记录链完整：买入 + 卖出 + 支取 = 3 条（设置本金不记记录）
    const page = listFundRecords(workspace.db, LEDGER, 1, 10)
    expect(page.total).toBe(3)
    expect(page.items[0].eventType).toBe(STOCK_EVENT_WITHDRAW)
    expect(page.items[0].amountChange).toBe(-200_000)
    expect(page.items[0].cashBalance).toBe(after.availableCash)
  })

  it('withdraw is rejected above the available cash and writes nothing on failure', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 5_000_000)
    withdraw(workspace.db, LEDGER, 100_000)

    const error = appError(() => withdraw(workspace.db, LEDGER, 4_900_001))
    expect(error.message).toContain('不能超过可用现金')
    expect(error.message).toBe('支取金额不能超过可用现金（49000.00 元）')
    expect(error.status).toBe(400)

    expect(appError(() => withdraw(workspace.db, LEDGER, 0)).message).toBe('支取金额必须大于 0')
    expect(appError(() => withdraw(workspace.db, LEDGER, -100)).status).toBe(400)

    const summary = getAccountSummary(workspace.db, LEDGER)
    expect(summary.withdrawnTotal).toBe(100_000)
    expect(summary.availableCash).toBe(4_900_000)

    const page = listFundRecords(workspace.db, LEDGER, 1, 10)
    expect(page.total).toBe(1)
  })

  it('withdraw accumulates without changing the principal', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 5_000_000)
    withdraw(workspace.db, LEDGER, 100_000)
    withdraw(workspace.db, LEDGER, 200_000)
    // 追加本金后再支取，本金始终是累计投入
    addPrincipal(workspace.db, LEDGER, 1_000_000)
    withdraw(workspace.db, LEDGER, 500_000)

    const summary = getAccountSummary(workspace.db, LEDGER)
    expect(summary.principal).toBe(6_000_000)
    expect(summary.withdrawnTotal).toBe(800_000)
    expect(summary.availableCash).toBe(6_000_000 - 800_000)
    expect(summary.availableCash + summary.positionCost).toBe(
      summary.principal - summary.withdrawnTotal,
    )
  })

  it('interest lifts cash without changing the principal and can be withdrawn', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 5_000_000)

    const after = addInterest(workspace.db, LEDGER, 100_000)
    expect(after.principal).toBe(5_000_000)
    expect(after.interestTotal).toBe(100_000)
    expect(after.withdrawnTotal).toBe(0)
    expect(after.availableCash).toBe(5_100_000)
    expect(after.availableCash + after.positionCost).toBe(5_100_000)

    // 资金记录：利息事件金额为正、带现金余额，且不是卖出（netPnl 为空）
    const page = listFundRecords(workspace.db, LEDGER, 1, 10)
    expect(page.total).toBe(1)
    expect(page.items[0].eventType).toBe(STOCK_EVENT_INTEREST_PRINCIPAL)
    expect(page.items[0].eventText).toBe('利息归本')
    expect(page.items[0].amountChange).toBe(100_000)
    expect(page.items[0].cashBalance).toBe(5_100_000)
    expect(page.items[0].netPnl).toBeNull()
    expect(page.items[0].remark).toContain('利息 1000')
    expect(page.items[0].remark).toBe('利息 1000.00 元')

    const operation = latestOperation(workspace.db, LEDGER)
    expect(operation?.action).toBe('利息归本')
    expect(operation?.detail).toBe('¥1000.00')
    expect(operation?.targetId).toBe(page.items[0].id)

    // 利息是账户里真实存在的现金：可以再支取出来
    const withdrawn = withdraw(workspace.db, LEDGER, 100_000)
    expect(withdrawn.interestTotal).toBe(100_000)
    expect(withdrawn.availableCash).toBe(5_000_000)

    // 非法金额 / 日期被拦下且不产生记录
    expect(appError(() => addInterest(workspace.db, LEDGER, 0)).message).toBe(
      '利息金额必须大于 0',
    )
    expect(appError(() => addInterest(workspace.db, LEDGER, -100)).status).toBe(400)
    expect(
      appError(() => addInterestAtDate(workspace.db, LEDGER, 100, 'not-a-date')).message,
    ).toContain('日期格式')
    expect(listFundRecords(workspace.db, LEDGER, 1, 10).total).toBe(2)
  })

  it('interest creates the account when none exists and an empty account cannot withdraw', () => {
    const workspace = newWorkspace()

    const summary = addInterest(workspace.db, LEDGER, 5000)
    expect(summary.principal).toBe(0)
    expect(summary.interestTotal).toBe(5000)
    expect(summary.availableCash).toBe(5000)
    expect(getOrCreateAccount(workspace.db, LEDGER).principal).toBe(0)

    const page = listFundRecords(workspace.db, LEDGER, 1, 10)
    expect(page.items[0].cashBalance).toBe(5000)

    const empty = newWorkspace()
    const error = appError(() => withdraw(empty.db, LEDGER, 1))
    expect(error.message).toBe('支取金额不能超过可用现金（0.00 元）')
  })

  it('interest accumulates and chains with principal events by date', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 1_000_000)

    addInterestAtDate(workspace.db, LEDGER, 30_000, '2026-02-01')
    addPrincipalAtDate(workspace.db, LEDGER, 500_000, '2026-02-02')
    addInterestAtDate(workspace.db, LEDGER, 20_000, '2026-02-03')

    const summary = getAccountSummary(workspace.db, LEDGER)
    expect(summary.principal).toBe(1_500_000)
    expect(summary.interestTotal).toBe(50_000)
    expect(summary.availableCash).toBe(1_550_000)
    expect(summary.availableCash).toBe(
      summary.principal + summary.interestTotal + summary.sellNetPnlTotal - summary.withdrawnTotal,
    )

    // 资金记录按日期由近及远，现金余额链逐条自洽
    const page = listFundRecords(workspace.db, LEDGER, 1, 10)
    expect(page.total).toBe(3)
    expect(page.items[0].recordDate).toBe('2026-02-03')
    expect(page.items[0].cashBalance).toBe(1_550_000)
    expect(page.items[1].cashBalance).toBe(1_530_000)
    expect(page.items[2].cashBalance).toBe(1_030_000)
  })

  it('backdated fund events are counted in the cash chain and available cash', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 10_000_000)
    addInterestAtDate(workspace.db, LEDGER, 999, '2026-08-20')
    expect(getAccountSummary(workspace.db, LEDGER).availableCash).toBe(10_000_999)

    // 补录一笔 8-01（早于那条利息）的支取：可用现金当场就少
    withdrawAtDate(workspace.db, LEDGER, 3_000_000, '2026-08-01')
    expect(getAccountSummary(workspace.db, LEDGER).availableCash).toBe(10_000_999 - 3_000_000)

    const page = listFundRecords(workspace.db, LEDGER, 1, 20)
    const recordOf = (eventType: string): StockFundRecord => {
      const found = page.items.find((item) => item.eventType === eventType)
      if (!found) throw new Error(`未找到 ${eventType} 资金记录`)
      return found
    }
    // 逐行余额按链序：支取（8-01）在前、利息（8-20）在后
    expect(recordOf(STOCK_EVENT_WITHDRAW).cashBalance).toBe(7_000_000)
    expect(recordOf(STOCK_EVENT_INTEREST_PRINCIPAL).cashBalance).toBe(7_000_999)
    // 备注里不写"录入时"的余额（日期倒填后那个数字与这一行的余额对不上）
    expect(recordOf(STOCK_EVENT_WITHDRAW).remark).toBe('支取 30000.00 元')
    expect(recordOf(STOCK_EVENT_INTEREST_PRINCIPAL).remark).toBe('利息 9.99 元')
  })

  it('withdraw and principal adds support an explicit record date', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 5_000_000)
    addPrincipalAtDate(workspace.db, LEDGER, 1_000_000, '2026-01-05')
    withdrawAtDate(workspace.db, LEDGER, 200_000, '2026-01-10')

    const page = listFundRecords(workspace.db, LEDGER, 1, 10)
    expect(page.total).toBe(2)
    // 列表按日期由近及远：支取 2026-01-10 在前，追加本金 2026-01-05 在后
    expect(page.items[0].recordDate).toBe('2026-01-10')
    expect(page.items[0].eventType).toBe(STOCK_EVENT_WITHDRAW)
    expect(page.items[1].recordDate).toBe('2026-01-05')
    expect(page.items[1].eventType).toBe(STOCK_EVENT_ADD_PRINCIPAL)

    const summary = getAccountSummary(workspace.db, LEDGER)
    expect(summary.principal).toBe(6_000_000)
    expect(summary.withdrawnTotal).toBe(200_000)

    const error = appError(() => addPrincipalAtDate(workspace.db, LEDGER, 100_000, '2026/01/05'))
    expect(error.message).toContain('日期格式')
    expect(
      appError(() => withdrawAtDate(workspace.db, LEDGER, 100_000, 'not-a-date')).status,
    ).toBe(400)
  })

  it('available cash subtracts the cost of open positions', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 10_000_000)
    seedPosition(workspace, 10_000, 1_000_510)

    const holding = getAccountSummary(workspace.db, LEDGER)
    // 行情缺失 → 市值按持仓成本计入，总资产 = 可用现金 + 持仓市值 = 本金
    expect(holding.positionCost).toBe(1_000_510)
    expect(holding.availableCash).toBe(10_000_000 - 1_000_510)
    expect(holding.availableCash + holding.positionCost).toBe(10_000_000)

    workspace.db
      .prepare('UPDATE stock_position SET quantity = 0, total_cost_cents = 0 WHERE id = ?')
      .run('position-1')
    const closed = getAccountSummary(workspace.db, LEDGER)
    expect(closed.positionCost).toBe(0)
    expect(closed.availableCash).toBe(10_000_000)
    expect(closed.availableCash + closed.positionCost).toBe(10_000_000)
  })

  it('fund record pagination clamps page and page size', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 10_000_000)
    for (let index = 0; index < 12; index += 1) {
      addPrincipalAtDate(
        workspace.db,
        LEDGER,
        1000,
        `2026-01-${String(index + 1).padStart(2, '0')}`,
      )
    }

    // page < 1 → 1；pageSize < 1 → 10；pageSize > 100 → 100
    const first = listFundRecords(workspace.db, LEDGER, 0, 0)
    expect(first.page).toBe(1)
    expect(first.pageSize).toBe(10)
    expect(first.total).toBe(12)
    expect(first.items).toHaveLength(10)
    expect(first.items[0].recordDate).toBe('2026-01-12')

    const second = listFundRecords(workspace.db, LEDGER, 2, 200)
    expect(second.page).toBe(2)
    expect(second.pageSize).toBe(100)
    // 第二页已越过 12 条记录（100/页），返回空页
    expect(second.items).toEqual([])
  })

  it('fund records get strictly increasing created_at even within one second', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 10_000_000)
    addPrincipal(workspace.db, LEDGER, 1000)
    addPrincipal(workspace.db, LEDGER, 2000)
    addPrincipal(workspace.db, LEDGER, 3000)

    const records = listAllFundRecords(workspace.db, LEDGER)
    expect(records).toHaveLength(3)
    for (let index = 1; index < records.length; index += 1) {
      expect(records[index].createdAt).toBeGreaterThan(records[index - 1].createdAt)
    }
    // 同一记录日时列表按 created_at 由近及远
    const page = listFundRecords(workspace.db, LEDGER, 1, 10)
    expect(page.items.map((item) => item.amountChange)).toEqual([3000, 2000, 1000])
  })

  it('latest record and single-record lookup follow the record-date ordering', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 10_000_000)
    addInterestAtDate(workspace.db, LEDGER, 999, '2026-08-20')
    withdrawAtDate(workspace.db, LEDGER, 500, '2026-08-01')

    const latest = queryLatestFundRecord(workspace.db, LEDGER)
    expect(latest?.eventType).toBe(STOCK_EVENT_INTEREST_PRINCIPAL)
    expect(latest?.recordDate).toBe('2026-08-20')
    expect(latest?.cashBalance).toBe(10_000_499)

    expect(getFundRecord(workspace.db, latest?.id ?? '')?.recordDate).toBe('2026-08-20')
    expect(getFundRecord(workspace.db, 'absent')).toBeNull()
    expect(queryLatestFundRecord(workspace.db, OTHER_LEDGER)).toBeNull()
  })

  it('fund sums follow the cash formula', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 10_000_000)
    addInterest(workspace.db, LEDGER, 999)
    withdraw(workspace.db, LEDGER, 5000)
    seedPosition(workspace, 100, 12_345)

    const summary = getAccountSummary(workspace.db, LEDGER)
    expect(summary.interestTotal).toBe(999)
    expect(summary.withdrawnTotal).toBe(5000)
    expect(summary.positionCost).toBe(12_345)
    expect(summary.availableCash).toBe(10_000_000 + 999 - 5000 - 12_345)
    expect(summary.availableCash).toBe(
      summary.principal + summary.interestTotal + summary.sellNetPnlTotal - summary.withdrawnTotal -
        summary.positionCost,
    )
  })

  it('trade-fund repair helpers only touch buy/sell records', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 10_000_000)
    seedFundRecord(workspace, {
      id: 'buy-repair',
      recordDate: '2026-01-02',
      eventType: STOCK_EVENT_BUY,
      amountChange: -100_000,
    })
    seedFundRecord(workspace, {
      id: 'sell-repair',
      recordDate: '2026-01-03',
      eventType: STOCK_EVENT_SELL,
      amountChange: 120_000,
      netPnl: 20_000,
    })
    addInterestAtDate(workspace.db, LEDGER, 100, '2026-01-04')

    expect(listTradeFundLedgerIds(workspace.db)).toEqual([LEDGER])
    deleteTradeFundRecords(workspace.db, LEDGER)

    const page = listFundRecords(workspace.db, LEDGER, 1, 10)
    expect(page.total).toBe(1)
    expect(page.items[0].eventType).toBe(STOCK_EVENT_INTEREST_PRINCIPAL)

    recalculateCashChain(workspace.db, LEDGER)
    expect(getAccountSummary(workspace.db, LEDGER).availableCash).toBe(10_000_100)
  })

  it('operation log keeps only the newest ten fund actions', () => {
    const workspace = newWorkspace()
    seedPrincipal(workspace, 10_000_000)
    for (let index = 1; index <= 11; index += 1) {
      addPrincipal(workspace.db, LEDGER, index * 100)
    }

    const operations = listOperations(workspace.db, LEDGER)
    expect(operations).toHaveLength(10)
    expect(operations[0].detail).toBe('¥11.00')
    expect(operations[9].detail).toBe('¥2.00')
    expect(operations.some((item) => item.detail === '¥1.00')).toBe(false)

    // 裁剪掉的只是记录：本金仍然是 11 次追加的总和
    const summary = getAccountSummary(workspace.db, LEDGER)
    expect(summary.principal).toBe(10_000_000 + ((1 + 11) * 11 / 2) * 100)
  })

  it('record dates are parsed strictly and mapped to the host local day', () => {
    expect(normalizeStockRecordDate('2026-01-05')).toBe('2026-01-05')
    expect(normalizeStockRecordDate('2024-02-29')).toBe('2024-02-29')

    const before = todayYmd()
    const today = normalizeStockRecordDate('')
    const after = todayYmd()
    expect([before, after]).toContain(today)

    for (const invalid of [
      '2026-1-5',
      '2026/01/05',
      '2026-02-30',
      '2026-13-01',
      '2026-00-10',
      '2025-02-29',
      ' 2026-01-05',
    ]) {
      const error = appError(() => normalizeStockRecordDate(invalid))
      expect(error.message, invalid).toBe('日期格式应为 YYYY-MM-DD')
      expect(error.status).toBe(400)
    }

    // 本地 00:00 与 12:00 都落在同一天（按 UTC 会把 00:00 取成前一天）
    const midnight = Math.trunc(new Date(2026, 7, 24, 0, 0, 0).getTime() / 1000)
    const noon = Math.trunc(new Date(2026, 7, 24, 12, 0, 0).getTime() / 1000)
    expect(unixToDate(midnight)).toBe('2026-08-24')
    expect(unixToDate(noon)).toBe('2026-08-24')
  })
})
