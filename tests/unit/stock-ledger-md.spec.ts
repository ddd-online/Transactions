import { describe, expect, it } from 'vitest'

import type { StockLedgerDto } from '../../shared/types/stock-ledger'
import { ledgerMarkdown } from '../../src/pages/stock-ledger-md'

function ledger(overrides: Partial<StockLedgerDto> = {}): StockLedgerDto {
  return {
    exists: true,
    roundId: 'r1',
    closed: true,
    whyBuy: '12 号影院线题材，涨停股 13 号开盘底部上冲买入。',
    stopLoss: '24.74',
    takeProfit: '28.75',
    followedSystem: '否',
    summary: '止损未触发',
    buyPrice: '27.49',
    buyCost: '¥5503.06',
    sellPrice: '27.675',
    sellNet: '¥5522.17',
    netPnl: '¥19.11',
    ...overrides,
  }
}

describe('交易台账 Markdown', () => {
  it('清仓后十个字段按界面顺序全部写出', () => {
    const text = ledgerMarkdown(ledger())
    expect(text).toBe(
      [
        '## 交易台账',
        '',
        '- 为什么买：12 号影院线题材，涨停股 13 号开盘底部上冲买入。',
        '- 买入价：27.49',
        '- 买入成本：¥5503.06',
        '- 止损：24.74',
        '- 止盈：28.75',
        '- 卖出价：27.675',
        '- 卖出净额：¥5522.17',
        '- 净盈亏：¥19.11',
        '- 是否按系统执行：否',
        '- 一句话：止损未触发',
        '',
      ].join('\n'),
    )
  })

  it('没清仓时卖出三格写「清仓后回填」，与界面一致', () => {
    const text = ledgerMarkdown(ledger({ closed: false, sellPrice: '', sellNet: '', netPnl: '' }))
    expect(text).toContain('- 卖出价：清仓后回填')
    expect(text).toContain('- 卖出净额：清仓后回填')
    expect(text).toContain('- 净盈亏：清仓后回填')
  })

  it('空字段写成破折号，多行文本续行缩进两格', () => {
    const text = ledgerMarkdown(
      ledger({ whyBuy: '第一行\r\n第二行', summary: '', stopLoss: '' }),
    )
    expect(text).toContain('- 为什么买：第一行\n  第二行')
    expect(text).toContain('- 止损：—')
    expect(text).toContain('- 一句话：—')
  })

  it('段间空行不会把一条列表项截成两条', () => {
    const text = ledgerMarkdown(ledger({ whyBuy: '第一段\n\n第二段\n' }))
    expect(text).toContain('- 为什么买：第一段\n  第二段')
    expect(text).not.toContain('第一段\n\n')
  })

  it('没有台账时返回空串', () => {
    expect(ledgerMarkdown(null)).toBe('')
    expect(ledgerMarkdown(ledger({ exists: false }))).toBe('')
  })
})
