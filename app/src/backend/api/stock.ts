import api from "@/backend/api/api-client";
import type { StockFeeSetting, StockFundRecordPage, StockNameResult, StockOverview, StockPosition, StockTrade, StockTradeHistory, StockTradeHistoryDetail, StockTradeHistorySummary } from "@/types/transactions";

export async function fetchStockOverview(ledgerId: string): Promise<StockOverview> {
    return api.get<StockOverview>(`/v1/stock/account/overview?ledger_id=${encodeURIComponent(ledgerId)}`, '查询股票账户总览');
}

export async function setStockPrincipal(ledgerId: string, amount: number): Promise<StockOverview> {
    return api.post<StockOverview>('/v1/stock/account/principal', { ledger_id: ledgerId, amount }, '设置本金');
}

export async function addStockPrincipal(ledgerId: string, amount: number): Promise<StockOverview> {
    return api.post<StockOverview>('/v1/stock/account/principal/add', { ledger_id: ledgerId, amount }, '追加本金');
}

export async function withdrawStockPrincipal(ledgerId: string, amount: number): Promise<StockOverview> {
    return api.post<StockOverview>('/v1/stock/account/withdraw', { ledger_id: ledgerId, amount }, '支取');
}

export async function fetchStockFeeSettings(ledgerId: string): Promise<StockFeeSetting> {
    return api.get<StockFeeSetting>(`/v1/stock/account/fee-settings?ledger_id=${encodeURIComponent(ledgerId)}`, '查询交易费用设置');
}

export async function saveStockFeeSettings(
    ledgerId: string,
    commissionRate: number,
    minCommission: number,
    stampDutyRate: number,
    transferFeeRate: number
): Promise<StockFeeSetting> {
    return api.put<StockFeeSetting>('/v1/stock/account/fee-settings', {
        ledger_id: ledgerId,
        commission_rate: commissionRate,
        min_commission: minCommission,
        stamp_duty_rate: stampDutyRate,
        transfer_fee_rate: transferFeeRate,
    }, '保存交易费用设置');
}

export async function fetchStockFundRecords(ledgerId: string, page: number, pageSize: number): Promise<StockFundRecordPage> {
    return api.get<StockFundRecordPage>(
        `/v1/stock/account/fund-records?ledger_id=${encodeURIComponent(ledgerId)}&page=${page}&page_size=${pageSize}`,
        '查询资金变化记录'
    );
}

export async function fetchStockPositions(ledgerId: string): Promise<StockPosition[]> {
    return api.get<StockPosition[]>(`/v1/stock/positions?ledger_id=${encodeURIComponent(ledgerId)}`, '查询持仓');
}

export async function fetchStockTrades(ledgerId: string, stockCode: string): Promise<StockTrade[]> {
    return api.get<StockTrade[]>(
        `/v1/stock/trades?ledger_id=${encodeURIComponent(ledgerId)}&stock_code=${encodeURIComponent(stockCode)}`,
        '查询交易历史'
    );
}

export async function fetchStockTradeHistories(ledgerId: string): Promise<StockTradeHistory[]> {
    return api.get<StockTradeHistory[]>(
        `/v1/stock/history?ledger_id=${encodeURIComponent(ledgerId)}`,
        '查询交易历史'
    );
}

export async function fetchStockTradeHistoryDetail(ledgerId: string, stockCode: string): Promise<StockTradeHistoryDetail> {
    return api.get<StockTradeHistoryDetail>(
        `/v1/stock/history/detail?ledger_id=${encodeURIComponent(ledgerId)}&stock_code=${encodeURIComponent(stockCode)}`,
        '查询交易历史详情'
    );
}

export async function fetchStockTradeHistorySummary(ledgerId: string): Promise<StockTradeHistorySummary> {
    return api.get<StockTradeHistorySummary>(
        `/v1/stock/history/summary?ledger_id=${encodeURIComponent(ledgerId)}`,
        '查询交易历史总览'
    );
}

export async function fetchStockName(stockCode: string): Promise<string> {
    const data = await api.get<StockNameResult>(
        `/v1/stock/name?stock_code=${encodeURIComponent(stockCode)}`,
        '查询股票名称'
    );
    return data?.stockName ?? '';
}

export async function createStockTrade(
    ledgerId: string,
    stockCode: string,
    stockName: string,
    tradeType: string,
    price: number,
    lots: number,
    tradeTime: number,
    remark: string
): Promise<StockTrade> {
    return api.post<StockTrade>('/v1/stock/trades', {
        ledger_id: ledgerId,
        stock_code: stockCode,
        stock_name: stockName,
        trade_type: tradeType,
        price,
        lots,
        trade_time: tradeTime,
        remark,
    }, '记录交易');
}

export async function resetStockData(ledgerId: string): Promise<boolean> {
    return api.post<boolean>('/v1/stock/reset', { ledger_id: ledgerId }, '重置股票交易数据');
}
