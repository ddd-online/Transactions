import api from "@/backend/api/api-client";
import type { StockFeeSetting, StockFundRecordPage, StockOverview } from "@/types/transactions";

export async function fetchStockOverview(ledgerId: string): Promise<StockOverview> {
    return api.get<StockOverview>(`/v1/stock/account/overview?ledger_id=${encodeURIComponent(ledgerId)}`, '查询股票账户总览');
}

export async function setStockPrincipal(ledgerId: string, amount: number): Promise<StockOverview> {
    return api.post<StockOverview>('/v1/stock/account/principal', { ledger_id: ledgerId, amount }, '设置本金');
}

export async function addStockPrincipal(ledgerId: string, amount: number): Promise<StockOverview> {
    return api.post<StockOverview>('/v1/stock/account/principal/add', { ledger_id: ledgerId, amount }, '追加本金');
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
