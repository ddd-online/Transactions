import api from "@/backend/api/api-client";
import type { TransactionTemplate } from "@/types/transactions";

export interface TransactionTemplateDto {
    template_id?: string;
    ledger_id: string;
    template_name: string;
    transaction_type: string;
    category: string;
    tags: string[];
    flags: string;
    description: string;
    sort_order?: number;
}

export async function createTemplate(data: TransactionTemplateDto): Promise<string> {
    return api.post<string>('/v1/templates', data, '创建模板');
}

export async function queryTemplates(ledgerId: string): Promise<TransactionTemplate[]> {
    return api.get<TransactionTemplate[]>(`/v1/templates?ledgerId=${encodeURIComponent(ledgerId)}`, '查询模板');
}

export async function deleteTemplate(templateId: string): Promise<void> {
    return api.delete<void>(`/v1/templates/${encodeURIComponent(templateId)}`, '删除模板');
}

export async function updateTemplateSort(templateId: string, ledgerId: string, sortOrder: number): Promise<void> {
    return api.patch<void>(`/v1/templates/${encodeURIComponent(templateId)}/sort`, { ledgerId, sortOrder }, '更新模板排序');
}