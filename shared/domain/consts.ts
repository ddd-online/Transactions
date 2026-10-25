/**
 * 全局常量。
 *
 * 字符串字面量是数据既有的一部分（数据库中存的是这些值），修改即为破坏性变更。
 */

export const LOG_NAME = 'transactions.log'
export const DB_NAME = 'transactions.db'
export const ALL = 'all'

// ---------- 交易类型 ----------
export const TRANSACTION_TYPE_INCOME = 'income'
export const TRANSACTION_TYPE_EXPENSE = 'expense'
export const TRANSACTION_TYPE_TRANSFER = 'transfer'
export const TRANSACTION_TYPES = [
  TRANSACTION_TYPE_INCOME,
  TRANSACTION_TYPE_EXPENSE,
  TRANSACTION_TYPE_TRANSFER,
] as const

// ---------- 股票资金事件类型 ----------
export const STOCK_EVENT_ADD_PRINCIPAL = 'add_principal'
export const STOCK_EVENT_WITHDRAW = 'withdraw'
export const STOCK_EVENT_INTEREST_PRINCIPAL = 'interest_principal'
export const STOCK_EVENT_BUY = 'buy'
export const STOCK_EVENT_SELL = 'sell'

// ---------- 持仓交易类型 ----------
export const STOCK_TRADE_OPEN = 'open'
export const STOCK_TRADE_ADD = 'add'
export const STOCK_TRADE_REDUCE = 'reduce'
export const STOCK_TRADE_CLOSE = 'close'

// ---------- 可回滚操作的种类 ----------
export const STOCK_OP_KIND_FUND = 'fund'
export const STOCK_OP_KIND_ORDER = 'order'

// ---------- 轮次交易标签 ----------
export const STOCK_TAG_ANALYSIS = '分析'
export const STOCK_TAG_DABAN = '打板'
export const STOCK_TAG_WEIPAN = '尾盘'
export const STOCK_TAG_ZHUIZHANG = '追涨'
export const STOCK_TAG_XULI = '蓄力'

export function defaultStockTradeTags(): string[] {
  return [
    STOCK_TAG_ANALYSIS,
    STOCK_TAG_DABAN,
    STOCK_TAG_WEIPAN,
    STOCK_TAG_ZHUIZHANG,
    STOCK_TAG_XULI,
  ]
}

export const TAG_POLICY_ANY = 'any'
export const TAG_POLICY_ALL = 'all'

// ---------- 本轮复盘模板 ----------
export const STOCK_REVIEW_TEMPLATE_DEFAULT =
  '买入理由：\n卖出理由：\n买点审视：\n卖点审视：\n交易心得：\n'
export const STOCK_REVIEW_TEMPLATE_MAX_CHARS = 200

export const STOCK_DAILY_REVIEW_TEMPLATE_DEFAULT = '今日盘面：\n操作计划：\n情绪与纪律：\n'

// ---------- 待办 ----------
export const TODO_STATUS_DOING = 'doing'
export const TODO_STATUS_DONE = 'done'
export const TODO_STATUSES = [TODO_STATUS_DOING, TODO_STATUS_DONE] as const

export const TODO_LEVELS = [-5, -3, -1, 1, 3, 5] as const
export const TODO_LEVEL_LABELS = ['低', '中低', '次低', '次高', '中高', '高'] as const
export const TODO_LEVEL_DEFAULT = -1

/** 就近取档：幅度向上取到相邻奇数，超出 ±5 夹到端点，0 落到默认档。 */
export function snapTodoLevel(value: number): number {
  const magnitude = Math.abs(value)
  const snapped = magnitude >= 5 ? 5 : magnitude + (1 - (magnitude % 2))
  if (value < 0) return -snapped
  if (value === 0) return TODO_LEVEL_DEFAULT
  return snapped
}

/** 档位文案：不在六档里的值先就近取档。 */
export function todoLevelLabel(value: number): string {
  const snapped = snapTodoLevel(value)
  const index = TODO_LEVELS.indexOf(snapped as (typeof TODO_LEVELS)[number])
  return TODO_LEVEL_LABELS[index >= 0 ? index : 0]
}

export const TODO_CARD_TITLE_MAX = 200
export const TODO_ITEM_TITLE_MAX = 500
export const TODO_PROGRESS_MAX = 2000

/** 股票心得是一句话：单行输入，最多 80 字。 */
export const STOCK_LESSON_TEXT_MAX = 80
