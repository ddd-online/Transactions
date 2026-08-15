import api from "@/backend/api/api-client";
import type { Ledger } from "@/types/transactions";

export async function queryAllLedgers(): Promise<Ledger[]> {
    return api.get<Ledger[]>('/v1/ledgers?id=all', '查询账本');
}

export async function createLedger(name: string, description: string = ''): Promise<string> {
    return api.post<string>('/v1/ledgers', { name, description }, '创建账本');
}

export async function modifyLedger(id: string, name: string, description: string = ''): Promise<void> {
    return api.patch<void>(`/v1/ledgers/${id}`, { name, description }, '修改账本');
}

export async function deleteLedgerById(id: string): Promise<void> {
    return api.delete<void>(`/v1/ledgers/${id}`, '删除账本');
}
