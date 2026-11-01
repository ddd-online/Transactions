import type { StockLedgerDto } from '../../shared/types/stock-ledger'
import type { StockTradeDto } from '../../shared/types/stock-history'
import { stockDate, stockMoney, stockTradeTypeLabel } from './stock-format'

/** 没清仓时，卖出三格在界面上的占位文案 —— 复制出去也保持同一句话。 */
const PENDING = '清仓后回填'

/**
 * 把一张台账连成 Markdown，顺序与界面上的几段一致（买入计划 → 清仓结果 → 执行复盘 → 成交记录）。
 *
 * 全部是标题 + 无序列表，没有表格：粘到笔记 / 聊天里都不会被当成需要列宽的东西。
 * 字段值可能来自多行输入框，续行缩进两格，粘贴到任何 Markdown 里都还是同一条列表项；
 * 空字段写成 `—`（与只读页显示的破折号一致），不留一个只有冒号的空条目。
 */
export function ledgerMarkdown(
  ledger: StockLedgerDto | null,
  trades: readonly StockTradeDto[] = [],
): string {
  if (!ledger?.exists) return ''
  const rows: Array<[string, string]> = [
    ['为什么买', ledger.whyBuy],
    ['买入价', ledger.buyPrice],
    ['买入成本', ledger.buyCost],
    ['止损', ledger.stopLoss],
    ['止盈', ledger.takeProfit],
    ['卖出价', ledger.closed ? ledger.sellPrice : PENDING],
    ['卖出净额', ledger.closed ? ledger.sellNet : PENDING],
    ['净盈亏', ledger.closed ? ledger.netPnl : PENDING],
    ['是否按系统执行', ledger.followedSystem],
    ['一句话', ledger.summary],
  ]
  const ledgerSection = `## 交易台账\n\n${rows.map(([label, value]) => `- ${label}：${inline(value)}`).join('\n')}\n`

  const tradeSection = tradeLines(trades)
  return tradeSection ? `${ledgerSection}\n${tradeSection}` : ledgerSection
}

/**
 * 成交记录：一笔一条，按成交时间从早到晚（同一时刻保持原顺序）。
 *
 * 每条只留四样东西 —— 日期（年月日）、买卖类型、手数、成交金额；费用与盈亏在台账那几句里
 * 已经有了合计，不在这条流水上再算一遍。
 */
function tradeLines(trades: readonly StockTradeDto[]): string {
  if (trades.length === 0) return ''
  const ordered = [...trades]
    .map((trade, index) => ({ trade, index }))
    .sort((left, right) => left.trade.tradeTime - right.trade.tradeTime || left.index - right.index)
    .map(({ trade }) => trade)
  const rows = ordered.map(
    (trade) =>
      `- ${stockDate(trade.tradeTime)} · ${stockTradeTypeLabel(trade.tradeType)} · ${trade.lots} 手 · ${stockMoney(trade.amount)}`,
  )
  return `## 成交记录\n\n${rows.join('\n')}\n`
}

function inline(value: string): string {
  const lines = value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    // 段与段之间的空行会把一条列表项截成两条，这里只留实词行，续行缩进两格
    .filter((line) => line !== '')
  if (lines.length === 0) return '—'
  return lines.join('\n  ')
}
