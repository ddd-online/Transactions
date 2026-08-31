import type {Dayjs} from "dayjs";

/**
 * 表示一个前端使用的消费记录
 */
export interface TrForm {
    id: string;
    price: string;
    type: string;
    category: string;
    description: string;
    tags: string[];
    flags: string[];
    time: Dayjs;
    keyEventDate?: string;  // 关联的关键事件日期，可为空
}

/**
 * 后端返回的响应的规范结构
 */
export interface Result<T = any> {
    code: number;
    msg: string;
    data: T;
}

export interface TrQueryResult {
    items: TransactionRecord[];
    total: number;
    page: number;
    page_size: number;
    total_pages: number;
    trStatistics: TrStatistics;
}

/**
 * 账本
 */
export interface Ledger {
    id: string;           // 账本UUID
    name: string;         // 账本名称
    description: string;  // 账本描述
    createdAt: number;   // 创建时间（Unix 时间戳，单位秒）
    updatedAt: number;   // 更新时间（Unix 时间戳，单位秒）
}

/**
 * 消费记录
 */
export interface TransactionRecord {
    ledgerId: string;
    transactionId: string;
    price: number;
    transactionType: string;
    category: string;
    description: string;
    tags: string[];
    transactionAt: number;
    outlier: boolean;
    keyEventDate?: string;  // 关联的关键事件日期，可为空
}

/**
 * 消费类型
 */
export interface Category {
    name: string;
    transactionType: string;
    sortOrder?: number;
    recordCount?: number;
}

/**
 * 消费标签
 */
export interface Tag {
    name: string;                      // 标签名称
    categoryTransactionType: string;  // 分类:交易类型，格式如"餐饮:支出"
    sortOrder?: number;
    recordCount?: number;
}

/**
 * 消费记录统计数据
 */
export interface TrStatistics {
    income: number;    // 收入金额
    expense: number;   // 支出金额
    transfer: number;  // 转账金额
}

/**
 * 消费记录条件查询
 */
export interface TrQueryCondition {
    ledgerId: string;
    tsRange?: number[];
    items?: TrQueryConditionItem[];
    offset?: number;
    limit?: number;
    sortFields?: TrQuerySortField[];
}

/**
 * 消费记录排序字段
 */
export interface TrQuerySortField {
    field: string;
    order: 'asc' | 'desc';
}

/**
 * 消费记录条件项
 */
export interface TrQueryConditionItem {
    transactionType: string;
    category: string;
    tags: string[];
    tagPolicy: string;
    tagNot: boolean;
    description: string;
}

/**
 * 时间范围类型 时间范围标签类型 时间范围值类型
 */
type RangeValue = [Dayjs, Dayjs] | undefined;
type TimeRangeTypeValue = 'date' | 'month' | 'year';
type TimeRangeTypeLabel = '日' | '月' | '年';

type TransactionType = 'income' | 'expense' | 'transfer';

/**
 * 消费记录模板
 */
export interface TransactionTemplate {
    template_id: string;
    ledger_id: string;
    template_name: string;
    transaction_type: string;
    category: string;
    tags: string[];
    flags: string;
    description: string;
    sort_order?: number;
}

/**
 * 关键事件
 */
export interface KeyEvent {
    id: string;           // 事件UUID
    date: string;         // 日期 YYYY-MM-DD
    title: string;        // 事件标题（可为空）
    content: string;      // 事件内容
    color: string;        // 颜色标记（可为空，hex 色值）
    createdAt: number;    // 创建时间戳
    updatedAt: number;     // 更新时间戳
    ledgerId: string;
}

/**
 * 关键事件图片
 */
export interface KeyEventImage {
    id: string;
    eventDate: string;
    filePath: string;
    thumbPath: string;
    sortOrder: number;
    createdAt: number;
}

/**
 * 日记条目
 */
export interface DiaryEntry {
    id: string;           // UUID
    date: string;         // YYYY-MM-DD
    content: string;      // Markdown 正文
    wordCount: number;    // 字数（Unicode 字符数）
    mood: string;         // 心情 emoji（可为空）
    createdAt: number;    // Unix 时间戳
    updatedAt: number;    // Unix 时间戳
}

/**
 * 日记日期列表项（用于构建左侧树）
 */
export interface DiaryDateItem {
    date: string;         // YYYY-MM-DD
    wordCount: number;    // 字数（Unicode 字符数）
    mood: string;         // 心情 emoji
}

/**
 * 股票账户总览（金额单位：分）
 */
export interface StockOverview {
    principal: number;            // 本金
    currentCash: number;          // 当前现金（末条资金记录余额，无记录时=本金）
    positionMarketValue: number;  // 持仓市值（持仓模块接入后填充）
    totalAssets: number;          // 总资产 = 当前现金 + 持仓市值
    realizedPnl: number;          // 已实现总盈亏（Σ 卖出净盈亏）
    totalPnlPercent: number;      // 总盈亏占本金百分比（%）
}

/**
 * 交易费用设置
 */
export interface StockFeeSetting {
    id: string;
    ledgerId: string;
    commissionRate: number;    // 佣金费率（万2.354 → 0.0002354）
    minCommission: number;     // 最低佣金（分/笔）
    stampDutyRate: number;     // 印花税率（卖出收取，0.05% → 0.0005）
    transferFeeRate: number;   // 过户费率（双向·仅沪市，0.001% → 0.00001）
}

/**
 * 资金变化记录
 */
export interface StockFundRecord {
    id: string;
    ledgerId: string;
    recordDate: string;        // YYYY-MM-DD
    eventType: string;         // add_principal | buy | sell
    eventText: string;         // 事件描述
    amountChange: number;      // 金额变化（分，带符号）
    cashBalance: number;       // 现金余额（分）
    netPnl: number | null;     // 卖出净盈亏（分），非卖出事件为 null
    remark: string;            // 备注
    createdAt: number;         // 创建时间戳
}

/**
 * 资金变化记录分页结果
 */
export interface StockFundRecordPage {
    items: StockFundRecord[];
    total: number;
    page: number;
    pageSize: number;
}

/**
 * 股票持仓
 */
export interface StockPosition {
    id: string;
    ledgerId: string;
    stockCode: string;
    stockName: string;
    quantity: number;            // 持仓数量（股）
    avgCost: number;             // 平均成本（分/股，含买入费用）
    totalCost: number;           // 持仓总成本（分）
    realizedPnl: number;         // 该股累计已实现盈亏（分）
}

/**
 * 股票交易记录
 */
export interface StockTrade {
    id: string;
    ledgerId: string;
    stockCode: string;
    stockName: string;
    tradeType: 'open' | 'add' | 'reduce' | 'close';
    price: number;               // 成交价（分/股）
    lots: number;                // 手数
    shares: number;              // 股数
    amount: number;              // 成交金额（分）
    fee: number;                 // 交易费用（分）
    commission: number;          // 佣金（分）
    stampDuty: number;           // 印花税（分），仅卖出非 0
    transferFee: number;         // 过户费（分），仅沪市非 0
    realizedPnl: number | null;  // 卖出净盈亏（分），仅减仓/清仓非空
    tradeTime: number;           // 成交时间（Unix 秒）
    remark: string;
}
