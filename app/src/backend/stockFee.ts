import type { StockFeeSetting, StockTrade } from '@/types/transactions'

/**
 * 交易费用计算（分），与后端 service/stock_service.go 保持同一算法：
 * 佣金按「委托成交总额」计算一次（不足最低佣金按最低佣金收取），
 * 再把佣金/印花税/过户费按各笔成交金额比例分摊到明细，末笔吸收取整余数。
 */
export interface FeeBreakdown {
    commission: number;      // 佣金（分）
    stampDuty: number;       // 印花税（分，仅卖出）
    transferFee: number;     // 过户费（分，仅沪市）
    total: number;           // 合计（分）
}

/** 沪市：60（主板）/ 68（科创板）开头，过户费双向收取 */
export const isShanghaiCode = (stockCode: string): boolean =>
    stockCode.startsWith('60') || stockCode.startsWith('68')

/** 佣金 = max(委托成交总额 × 费率, 最低佣金) */
export const computeCommission = (amount: number, setting: StockFeeSetting): number =>
    Math.max(Math.round(amount * setting.commissionRate), setting.minCommission)

/** 按委托成交总额计算一次费用 */
export function computeOrderFee(
    totalAmount: number,
    isSH: boolean,
    setting: StockFeeSetting,
    isBuy: boolean
): FeeBreakdown {
    const commission = computeCommission(totalAmount, setting)
    const stampDuty = isBuy ? 0 : Math.round(totalAmount * setting.stampDutyRate)
    const transferFee = isSH ? Math.round(totalAmount * setting.transferFeeRate) : 0
    return { commission, stampDuty, transferFee, total: commission + stampDuty + transferFee }
}

/** 按权重比例拆分金额，末项吸收取整余数 */
export function allocateByAmount(total: number, weights: number[]): number[] {
    const result = new Array<number>(weights.length).fill(0)
    if (weights.length === 0) return result
    const sum = weights.reduce((acc, weight) => acc + weight, 0)
    if (sum <= 0) {
        result[weights.length - 1] = total
        return result
    }
    let allocated = 0
    for (let i = 0; i < weights.length - 1; i++) {
        const value = Math.round((total * (weights[i] ?? 0)) / sum)
        result[i] = value
        allocated += value
    }
    result[weights.length - 1] = total - allocated
    return result
}

/** 把委托级费用分摊到各笔成交 */
export function allocateOrderFee(fee: FeeBreakdown, amounts: number[]): FeeBreakdown[] {
    const commissions = allocateByAmount(fee.commission, amounts)
    const stampDuties = allocateByAmount(fee.stampDuty, amounts)
    const transferFees = allocateByAmount(fee.transferFee, amounts)
    return amounts.map((_, index) => ({
        commission: commissions[index] ?? 0,
        stampDuty: stampDuties[index] ?? 0,
        transferFee: transferFees[index] ?? 0,
        total: (commissions[index] ?? 0) + (stampDuties[index] ?? 0) + (transferFees[index] ?? 0),
    }))
}

/** 一笔委托（同一 orderId 的多笔成交）在界面上聚合后的展示数据 */
export interface StockTradeOrderGroup {
    key: string;
    orderId: string;
    trades: StockTrade[];
    tradeType: StockTrade['tradeType'];
    isBuy: boolean;
    price: number;              // 均价（分/股）
    lots: number;
    shares: number;
    amount: number;
    fee: number;
    commission: number;
    stampDuty: number;
    transferFee: number;
    tradeTime: number;
    realizedPnl: number | null;
}

/** 委托分组：同 orderId 的成交聚合为一笔委托；存量无 orderId 时以自身为独立委托 */
export function groupTradesByOrder(trades: StockTrade[]): StockTradeOrderGroup[] {
    const groups = new Map<string, StockTrade[]>()
    const order: string[] = []
    for (const trade of trades) {
        const key = trade.orderId || trade.id
        if (!groups.has(key)) {
            groups.set(key, [])
            order.push(key)
        }
        groups.get(key)!.push(trade)
    }

    return order.map((key) => {
        const items = [...groups.get(key)!].sort((a, b) => a.orderSeq - b.orderSeq)
        const first = items[0]!
        const shares = items.reduce((acc, item) => acc + item.shares, 0)
        const amount = items.reduce((acc, item) => acc + item.amount, 0)
        const realized = items.reduce<number | null>(
            (acc, item) => (item.realizedPnl === null ? acc : (acc ?? 0) + item.realizedPnl),
            null
        )
        return {
            key,
            orderId: key,
            trades: items,
            tradeType: first.tradeType,
            isBuy: first.tradeType === 'open' || first.tradeType === 'add',
            price: shares > 0 ? Math.round(amount / shares) : 0,
            lots: items.reduce((acc, item) => acc + item.lots, 0),
            shares,
            amount,
            fee: items.reduce((acc, item) => acc + item.fee, 0),
            commission: items.reduce((acc, item) => acc + item.commission, 0),
            stampDuty: items.reduce((acc, item) => acc + item.stampDuty, 0),
            transferFee: items.reduce((acc, item) => acc + item.transferFee, 0),
            tradeTime: first.tradeTime,
            realizedPnl: realized,
        }
    })
}
