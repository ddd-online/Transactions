import api from "@/backend/api/api-client";
import type { TransactionRecord, TrQueryCondition, TrQueryResult, TrStatistics } from "@/types/transactions";
import type { ChartLine } from '@/backend/chart';

export async function queryTrOnCondition(condition: TrQueryCondition): Promise<TrQueryResult> {
    return api.post<TrQueryResult>('/v1/transactions/query', condition, '查询消费记录');
}

export interface ChartPoint {
    time: string
    amount: number // 分
}

export interface ChartQueryResponse {
    lines: {
        label: string
        type: string
        data: ChartPoint[]
    }[]
    statistics: TrStatistics
}

export interface ChartQueryRequest {
    ledgerId: string
    tsRange?: number[]
    granularity: 'year' | 'month'
    lines: ChartLine[]
}

export async function queryChartData(request: ChartQueryRequest): Promise<ChartQueryResponse> {
    return api.post<ChartQueryResponse>('/v1/transactions/query-chart-data', request, '查询图表数据');
}

export async function createTrForLedger(data: TransactionRecord): Promise<string> {
    return api.post<string>('/v1/transactions', data, '创建消费记录');
}

export async function batchCreateTrForLedger(data: TransactionRecord[]): Promise<number> {
    return api.post<number>('/v1/transactions/batch', data, '批量创建消费记录');
}

export async function deleteTrById(id: string): Promise<void> {
    return api.delete<void>(`/v1/transactions/${id}`, '删除消费记录');
}

export async function linkTrToKeyEvent(transactionId: string, date: string): Promise<string> {
    return api.post<string>('/v1/transactions/link', { transaction_id: transactionId, date }, '关联关键事件');
}

export async function unlinkTrFromKeyEvent(transactionId: string): Promise<string> {
    return api.post<string>('/v1/transactions/unlink', { transaction_id: transactionId }, '解除关联');
}

export async function fetchLinkedTransactions(ledgerId: string, date: string): Promise<TransactionRecord[]> {
    return api.get<TransactionRecord[]>(`/v1/transactions/linked/${date}?ledger_id=${encodeURIComponent(ledgerId)}`, '查询关联交易记录');
}
