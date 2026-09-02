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
    availableCash: number;        // 可用现金 = 总资产 − 当前持仓成本
    positionMarketValue: number;  // 持仓市值（持仓模块接入后填充）
    withdrawnTotal: number;       // 累计支取（分）
    totalAssets: number;          // 总资产 = 本金 + 总盈亏 − 累计支取
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
    roundId: string;               // 所属轮次ID（清仓时挂接到交易历史）
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

/**
 * 股票交易历史集合（左栏列表项，金额单位：分）
 */
export interface StockTradeHistory {
    id: string;
    ledgerId: string;
    stockCode: string;
    stockName: string;
    roundCount: number;            // 已完成轮次数
    totalPnl: number;              // 该股累计已实现盈亏（分）
    totalPnlRate: number;          // 累计盈亏率（%）
    lastClosedAt: number;          // 最近一次清仓时间（Unix 秒）
    createdAt: number;
    updatedAt: number;
}

/**
 * 一次完整轮次：从建仓到清仓的全部交易 + 本轮盈亏
 */
export interface StockTradeRound {
    id: string;
    historyId: string;
    roundNo: number;
    openedAt: number;              // 本轮首次建仓时间（Unix 秒）
    closedAt: number;              // 本轮清仓时间（Unix 秒）
    review: string;                // 本轮交易复盘（500 字以内）
    pnl: number;                   // 本轮盈亏（分）
    pnlRate: number;               // 本轮盈亏率（%）
    tradeCount: number;
    trades: StockTrade[];
}

/**
 * 单只股票交易历史详情（右栏）
 */
export interface StockTradeHistoryDetail {
    id: string;
    ledgerId: string;
    stockCode: string;
    stockName: string;
    roundCount: number;
    totalPnl: number;
    totalPnlRate: number;
    winCount: number;              // 盈利轮数
    lossCount: number;             // 亏损轮数
    lastClosedAt: number;
    rounds: StockTradeRound[];
}

/**
 * 交易历史总览：全部已清仓股票的盈亏、胜负与轮次汇总
 */
export interface StockTradeHistorySummary {
    stockCount: number;            // 已清仓股票数
    roundCount: number;            // 总轮次
    winCount: number;              // 盈利轮次
    lossCount: number;             // 亏损轮次
    totalPnl: number;              // 总盈亏（分）
    totalPnlRate: number;          // 总盈亏率（%）
}

/**
 * 交易统计总览：本金 + 逐笔结算统计点。
 * 统计口径：一笔 = 一只股票的一次完整「建仓 → 清仓」（一个已归档轮次），
 * 全部股票按清仓时间合成结算序列，自第 1 笔起按累计口径逐笔统计。
 */
export interface StockStatistics {
    principal: number;                     // 当前本金（分）
    roundCount: number;                    // 已结算笔数（全部已完成轮次）
    points: StockStatisticsPoint[];        // 第 1 笔起的统计点
}

/**
 * 一个结算统计点：截至第 N 笔清仓的累计口径指标（金额单位：分）。
 */
export interface StockStatisticsPoint {
    sequence: number;                      // 全局结算序号（第 N 笔）
    closedAt: number;                      // 结算时间（该笔清仓时间，Unix 秒）
    stockCode: string;                     // 触发本统计点的股票代码
    stockName: string;                     // 触发本统计点的股票名称
    stockRoundNo: number;                  // 该股第几轮
    pnl: number;                           // 本笔盈亏（分）
    pnlRate: number;                       // 本笔盈亏率（%）
    tradeCount: number;                    // 本笔包含的成交笔数
    totalPnl: number;                      // 累计盈亏（分）
    winCount: number;                      // 累计盈利笔数
    lossCount: number;                     // 累计亏损笔数
    winRate: number;                       // 胜率（%）
    avgWin: number;                        // 平均盈利（分）
    avgLoss: number;                       // 平均亏损（分，正数）
    pnlRatio: number | null;               // 实际盈亏比（无亏损样本时为 null）
    expectancy: number;                    // 期望值（分/笔）
    maxDrawdown: number;                   // 最大回撤（分）
    maxDrawdownPct: number;                // 最大回撤占当时本金比例（%）
}

/**
 * 股票名称查询结果
 */
export interface StockNameResult {
    stockCode: string;
    stockName: string;
}
