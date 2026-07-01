import api from "@/backend/api/api-client";
import type { Tag } from "@/types/billadm";

export async function queryTags(categoryTransactionType: string, ledgerId?: string): Promise<Tag[]> {
    let url = `/v1/tags?categoryTransactionType=${encodeURIComponent(categoryTransactionType)}`;
    if (ledgerId) {
        url += `&ledgerId=${encodeURIComponent(ledgerId)}`;
    }
    return api.get<Tag[]>(url, '查询标签');
}

export async function createTag(ledgerId: string, name: string, categoryTransactionType: string): Promise<void> {
    await api.post<void>('/v1/tags', { ledgerId, name, categoryTransactionType }, '创建标签');
}

export async function deleteTag(name: string, categoryTransactionType: string, ledgerId: string): Promise<void> {
    await api.delete<void>(`/v1/tags/${encodeURIComponent(name)}?categoryTransactionType=${encodeURIComponent(categoryTransactionType)}&ledgerId=${encodeURIComponent(ledgerId)}`, '删除标签');
}

export async function updateTagSort(name: string, categoryTransactionType: string, sortOrder: number, ledgerId: string): Promise<void> {
    await api.patch<void>(`/v1/tags/${encodeURIComponent(name)}/sort`, { ledgerId, categoryTransactionType, sortOrder }, '更新标签排序');
}
