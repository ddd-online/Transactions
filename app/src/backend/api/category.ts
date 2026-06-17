import api from "@/backend/api/api-client";
import type { Category } from "@/types/billadm";

export async function queryCategory(trType: string, ledgerId?: string): Promise<Category[]> {
    let url = `/v1/categories?type=${encodeURIComponent(trType)}`;
    if (ledgerId) {
        url += `&ledgerId=${encodeURIComponent(ledgerId)}`;
    }
    return api.get<Category[]>(url, '查询分类');
}

export async function createCategory(ledgerId: string, name: string, transactionType: string): Promise<void> {
    await api.post<void>('/v1/categories', { ledgerId, name, transactionType }, '创建分类');
}

export async function deleteCategory(name: string, transactionType: string, ledgerId: string): Promise<void> {
    await api.delete<void>(`/v1/categories/${encodeURIComponent(name)}?type=${encodeURIComponent(transactionType)}&ledgerId=${encodeURIComponent(ledgerId)}`, '删除分类');
}

export async function updateCategorySort(name: string, transactionType: string, sortOrder: number): Promise<void> {
    await api.patch<void>(`/v1/categories/${encodeURIComponent(name)}/sort`, { transactionType, sortOrder }, '更新分类排序');
}

export interface InitializeCategoriesResponse {
    categories: number;
    tags: number;
}

export async function initializeCategories(ledgerId: string): Promise<InitializeCategoriesResponse> {
    return api.post<InitializeCategoriesResponse>('/v1/categories/initialize', { ledgerId }, '初始化分类标签');
}
