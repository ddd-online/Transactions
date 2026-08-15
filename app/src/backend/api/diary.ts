import api from "@/backend/api/api-client";
import type { DiaryEntry, DiaryDateItem } from "@/types/transactions";

/** 获取所有有日记的日期列表（含字数、心情） */
export async function fetchDates(): Promise<DiaryDateItem[]> {
    return api.get<DiaryDateItem[]>('/v1/diary/dates', '查询日记日期列表');
}

/** 获取某天的日记详情 */
export async function fetchDiary(date: string): Promise<DiaryEntry> {
    return api.get<DiaryEntry>(`/v1/diary/${date}`, '查询日记详情');
}

/** 创建或更新某天的日记 */
export async function saveDiary(date: string, content: string, mood: string): Promise<DiaryEntry> {
    return api.put<DiaryEntry>(`/v1/diary/${date}`, { content, mood }, '保存日记');
}

/** 删除某天的日记 */
export async function deleteDiary(date: string): Promise<void> {
    return api.delete<void>(`/v1/diary/${date}`, '删除日记');
}

/** 扫描目录，返回符合 YYYY-MM-DD.txt 格式的文件列表 */
export async function scanDirectory(directory: string): Promise<{ files: { date: string; path: string }[] }> {
    return api.post('/v1/diary/import/scan', { directory }, '扫描日记目录');
}

/** 导入单个日记文件 */
export async function importFile(path: string, date: string): Promise<{ date: string; wordCount: number }> {
    return api.post('/v1/diary/import/file', { path, date }, '导入日记文件');
}

export interface DiaryExportFailedItem {
    date: string
    error: string
}

export interface DiaryExportResult {
    total: number
    success: number
    failed: DiaryExportFailedItem[]
}

export interface DiaryExportFilter {
    year?: number
    month?: number
}

/** 导出日记到指定目录，每篇一个 YYYY-MM-DD.md；可传 year/month 按年或按月筛选 */
export async function exportDiary(directory: string, filter: DiaryExportFilter = {}): Promise<DiaryExportResult> {
    const body: Record<string, unknown> = { directory }
    if (filter.year) body.year = filter.year
    if (filter.month) body.month = filter.month
    return api.post('/v1/diary/export', body, '导出日记');
}
