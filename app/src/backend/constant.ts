export const TransactionTypeToLabel = new Map([
    ['income', '收入'],
    ['expense', '支出'],
    ['transfer', '转账']
]);

export const TransactionTypeToColor = new Map([
    ['income', '#3D8C5E'],
    ['expense', '#D9705A'],
    ['transfer', '#5C8DB5']
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
