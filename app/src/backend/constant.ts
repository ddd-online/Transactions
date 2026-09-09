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
