export const TransactionTypeToLabel = new Map([
    ['income', '收入'],
    ['expense', '支出'],
    ['transfer', '转账']
]);

export const TransactionTypeToColor = new Map([
    ['income', '#16a34a'],
    ['expense', '#dc2626'],
    ['transfer', '#3b82f6']
]);

export const TimeRangeValueToLabel = {
    'date': '日',
    'month': '月',
    'year': '年'
} as const;

export const TimeRangeLabelToValue = {
    '日': 'date',
    '月': 'month',
    '年': 'year'
} as const;

/**
 * 本轮复盘模板：点「写复盘」时预填，按「判断层 / 改进层 / 交易心得」分层。
 * 复盘是纯文本（按换行原文展示），所以只用中文小标题加空行分段，不带 Markdown 标记。
 */
export const StockRoundReviewTemplate = `判断层

买入理由：
卖出理由：

改进层

交易心得
`
