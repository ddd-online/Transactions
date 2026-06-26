import { defineStore } from 'pinia'
import { ref } from 'vue'
import {
    queryKeyEventsByYear,
    queryKeyEventByDate,
    saveKeyEvent,
    deleteKeyEvent,
    queryKeyEventImages,
    addKeyEventImage,
    deleteKeyEventImage
} from "@/backend/api/key-event";
import { useLedgerStore } from '@/stores/ledgerStore'
import NotificationUtil from "@/backend/notification";
import { createImageUrls, revokeImageUrls, type ImageUrls } from '@/backend/imageOptimizer'
import type { KeyEvent, KeyEventImage, TransactionRecord } from "@/types/billadm";

export const useKeyEventStore = defineStore('keyEvent', () => {
    const getLedgerId = () => useLedgerStore().currentLedgerId

    // 某年有记录的日期集合，用于日历高亮
    const datesWithRecords = ref(new Set<string>());
    const currentYear = ref(new Date().getFullYear());
    // 日期 -> 标题 的缓存
    const titles = ref(new Map<string, string>());
    // 日期 -> 颜色 的缓存
    const colors = ref(new Map<string, string>());
    const images = ref<KeyEventImage[]>([]);
    const imageCache = ref(new Map<string, KeyEventImage[]>());
    const trCache = ref(new Map<string, TransactionRecord[]>());
    const imageUrlCache = ref(new Map<string, ImageUrls>());
    // 完整的 KeyEvent 列表，供 KeyEventList 消费
    const events = ref<KeyEvent[]>([]);

    // 获取某年有记录的日期列表
    const fetchDatesByYear = async (year: number) => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            const eventList = await queryKeyEventsByYear(year, ledgerId);
            datesWithRecords.value = new Set(eventList.map(e => e.date));
            titles.value = new Map(eventList.map(e => [e.date, e.title]));
            colors.value = new Map(eventList.map(e => [e.date, e.color]));
            events.value = eventList;
            currentYear.value = year;
        } catch (error) {
            NotificationUtil.error('查询关键事件失败', `${error}`);
        }
    };

    // 获取单日详情
    const fetchEventByDate = async (date: string): Promise<KeyEvent | null> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return null
        try {
            const event = await queryKeyEventByDate(date, ledgerId);
            if (event) {
                titles.value.set(date, event.title);
                colors.value.set(date, event.color);
            }
            return event;
        } catch (error) {
            // 404 表示当天没有记录，返回 null
            return null;
        }
    };

    // 保存事件（新建或更新）
    const saveEvent = async (date: string, title: string, content: string, color: string): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            await saveKeyEvent(date, title, content, color, ledgerId);
            datesWithRecords.value.add(date);
            // 更新 events 缓存
            const idx = events.value.findIndex(e => e.date === date);
            if (idx >= 0) {
                events.value[idx] = { ...events.value[idx]!, title, content, color };
            } else {
                events.value.push({
                    id: '',
                    date,
                    title,
                    content,
                    color,
                    createdAt: Math.floor(Date.now() / 1000),
                    updatedAt: Math.floor(Date.now() / 1000),
                    ledgerId,
                });
            }
            titles.value.set(date, title);
            colors.value.set(date, color);
            NotificationUtil.success('保存成功');
        } catch (error) {
            NotificationUtil.error('保存失败', `${error}`);
            throw error;
        }
    };

    // 删除事件
    const deleteEvent = async (date: string): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            await deleteKeyEvent(date, ledgerId);
            datesWithRecords.value.delete(date);
            titles.value.delete(date);
            colors.value.delete(date);
            events.value = events.value.filter(e => e.date !== date);
            // revoke 该日期图片的 blob URLs
            const cachedImgs = imageCache.value.get(date)
            if (cachedImgs) {
                for (const img of cachedImgs) {
                    const urls = imageUrlCache.value.get(img.id)
                    if (urls) {
                        revokeImageUrls(urls)
                        imageUrlCache.value.delete(img.id)
                    }
                }
            }
            imageCache.value.delete(date);
            trCache.value.delete(date);
            NotificationUtil.success('删除成功');
        } catch (error) {
            NotificationUtil.error('删除失败', `${error}`);
            throw error;
        }
    };

    // 某天是否有记录
    const hasRecord = (date: string): boolean => {
        return datesWithRecords.value.has(date);
    };

    // 获取某天的标题
    const getTitle = (date: string): string => {
        return titles.value.get(date) || '';
    };

    // 获取某天的颜色
    const getColor = (date: string): string => {
        return colors.value.get(date) || '';
    };

    // 从 events 数组同步读取（不发起网络请求）
    const getEventByDate = (date: string): KeyEvent | null => {
        return events.value.find(e => e.date === date) ?? null;
    };

    const fetchImages = async (date: string): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        // 已有缓存则直接用
        if (imageCache.value.has(date)) {
            images.value = imageCache.value.get(date)!
            return
        }
        try {
            const result = await queryKeyEventImages(date, ledgerId);
            imageCache.value.set(date, result);
            images.value = result;
            // 异步生成 blob URLs（不阻塞渲染）
            for (const img of result) {
                if (!imageUrlCache.value.has(img.id)) {
                    createImageUrls(img.data).then(urls => {
                        imageUrlCache.value.set(img.id, urls)
                    }).catch(() => { /* 静默忽略，组件 fallback 到 base64 */ })
                }
            }
        } catch (error) {
            NotificationUtil.error('加载图片失败', `${error}`);
            images.value = [];
        }
    };

    const cacheLinkedTransactions = (date: string, trs: TransactionRecord[]): void => {
        trCache.value.set(date, trs);
    };

    // 预加载某年全部关键事件数据（事件列表 + 图片 + 关联交易）
    const preloadYearData = async (year: number): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            const eventList = await queryKeyEventsByYear(year, ledgerId);
            datesWithRecords.value = new Set(eventList.map(e => e.date));
            titles.value = new Map(eventList.map(e => [e.date, e.title]));
            colors.value = new Map(eventList.map(e => [e.date, e.color]));
            events.value = eventList;
            currentYear.value = year;

            // 并行预加载图片和关联交易
            if (eventList.length === 0) return;
            const { getLinkedTransactions } = await import('@/backend/functions');
            await Promise.all([
                ...eventList.map(async (e) => {
                    try {
                        const imgs = await queryKeyEventImages(e.date, ledgerId);
                        imageCache.value.set(e.date, imgs);
                        // 生成 blob URLs
                        for (const img of imgs) {
                            if (!imageUrlCache.value.has(img.id)) {
                                createImageUrls(img.data).then(urls => {
                                    imageUrlCache.value.set(img.id, urls)
                                }).catch(() => {})
                            }
                        }
                    } catch { /* 静默忽略单个失败 */ }
                }),
                ...eventList.map(async (e) => {
                    try {
                        const trs = await getLinkedTransactions(e.date);
                        trCache.value.set(e.date, trs);
                    } catch { /* 静默忽略单个失败 */ }
                }),
            ]);
        } catch (error) {
            NotificationUtil.error('预加载关键事件失败', `${error}`);
        }
    };

    const addImage = async (date: string, data: string, filename: string, onProgress?: (percent: number) => void): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            const imageId = await addKeyEventImage(date, data, filename, ledgerId, onProgress);
            images.value.push({
                id: imageId,
                eventDate: date,
                data,
                filename,
                sortOrder: images.value.length + 1,
                createdAt: Math.floor(Date.now() / 1000),
            });
            // 为新图片生成 blob URLs
            createImageUrls(data).then(urls => {
                imageUrlCache.value.set(imageId, urls)
            }).catch(() => {})
            // 更新缓存
            const cached = imageCache.value.get(date);
            if (cached) {
                cached.push({
                    id: imageId,
                    eventDate: date,
                    data,
                    filename,
                    sortOrder: cached.length + 1,
                    createdAt: Math.floor(Date.now() / 1000),
                });
            }
        } catch (error) {
            NotificationUtil.error('添加图片失败', `${error}`);
            throw error;
        }
    };

    const removeImage = async (imageId: string): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            const target = images.value.find(img => img.id === imageId);
            await deleteKeyEventImage(imageId, ledgerId);
            images.value = images.value.filter(img => img.id !== imageId);
            // revoke blob URL
            const urls = imageUrlCache.value.get(imageId)
            if (urls) {
                revokeImageUrls(urls)
                imageUrlCache.value.delete(imageId)
            }
            if (target) {
                const cached = imageCache.value.get(target.eventDate);
                if (cached) {
                    const idx = cached.findIndex(img => img.id === imageId);
                    if (idx >= 0) cached.splice(idx, 1);
                }
            }
        } catch (error) {
            NotificationUtil.error('删除图片失败', `${error}`);
            throw error;
        }
    };

    const clearImages = (): void => {
        // revoke 所有 blob URLs
        for (const urls of imageUrlCache.value.values()) {
            revokeImageUrls(urls)
        }
        imageUrlCache.value.clear()
        images.value = [];
    };

    return {
        datesWithRecords,
        currentYear,
        fetchDatesByYear,
        fetchEventByDate,
        saveEvent,
        deleteEvent,
        hasRecord,
        getTitle,
        getColor,
        getEventByDate,
        images,
        imageCache,
        imageUrlCache,
        trCache,
        events,
        fetchImages,
        addImage,
        removeImage,
        clearImages,
        preloadYearData,
        cacheLinkedTransactions,
    };
});
