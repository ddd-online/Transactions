import api from "@/backend/api/api-client";
import type { KeyEvent, KeyEventImage } from "@/types/billadm";

export async function queryKeyEventsByYear(year: number, ledgerId: string): Promise<KeyEvent[]> {
    return api.get<KeyEvent[]>(`/v1/key-events/year/${year}?ledger_id=${ledgerId}`, '查询关键事件列表');
}

export async function queryKeyEventByDate(date: string, ledgerId: string): Promise<KeyEvent> {
    return api.get<KeyEvent>(`/v1/key-events/${date}?ledger_id=${ledgerId}`, '查询关键事件详情');
}

export async function saveKeyEvent(date: string, title: string, content: string, color: string, ledgerId: string): Promise<string> {
    return api.post<string>('/v1/key-events', { date, title, content, color, ledger_id: ledgerId }, '保存关键事件');
}

export async function deleteKeyEvent(date: string, ledgerId: string): Promise<void> {
    return api.delete<void>(`/v1/key-events/${date}?ledger_id=${ledgerId}`, '删除关键事件');
}

export async function queryKeyEventImages(date: string, ledgerId: string): Promise<KeyEventImage[]> {
    return api.get<KeyEventImage[]>(`/v1/key-events/${date}/images?ledger_id=${ledgerId}`, '查询关键事件图片');
}

export async function addKeyEventImage(date: string, data: string, filename: string, ledgerId: string, onProgress?: (percent: number) => void): Promise<string> {
    return api.post<string>(
        `/v1/key-events/${date}/images`,
        { data, filename, ledger_id: ledgerId },
        '添加关键事件图片',
        {
            timeout: 30000,
            onUploadProgress: (e: { loaded: number; total?: number }) => {
                if (e.total && e.total > 0) {
                    onProgress?.(Math.round((e.loaded / e.total) * 100))
                }
            },
        }
    )
}

export async function deleteKeyEventImage(imageId: string, ledgerId: string): Promise<void> {
    return api.delete<void>(`/v1/key-event-images/${imageId}?ledger_id=${ledgerId}`, '删除关键事件图片');
}
