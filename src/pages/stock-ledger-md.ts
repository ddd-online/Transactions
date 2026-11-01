import type { StockLedgerDto } from '../../shared/types/stock-ledger'

/** 没清仓时，卖出三格在界面上的占位文案 —— 复制出去也保持同一句话。 */
const PENDING = '清仓后回填'

/**
 * 把一张台账连成 Markdown 清单，顺序与界面上的三段一致（买入计划 → 清仓结果 → 执行复盘）。
 *
 * 字段值可能来自多行输入框，续行缩进两格，粘贴到任何 Markdown 里都还是同一条列表项；
 * 空字段写成 `—`（与只读页显示的破折号一致），不留一个只有冒号的空条目。
 */
export function ledgerMarkdown(ledger: StockLedgerDto | null): string {
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
  return `## 交易台账\n\n${rows.map(([label, value]) => `- ${label}：${inline(value)}`).join('\n')}\n`
}

function inline(value: string): string {
  const text = value.replace(/\r\n?/g, '\n').trim()
  if (!text) return '—'
  return text
    .split('\n')
    .map((line) => line.trim())
    .join('\n  ')
}
