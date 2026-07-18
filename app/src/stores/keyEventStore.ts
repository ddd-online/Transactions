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
} from "@/backend/api/key-event"
import { fetchLinkedTransactions } from "@/backend/api/tr"
import { withErrorHandling } from "@/backend/errorHandler"
import { useLedgerStore } from '@/stores/ledgerStore'
import NotificationUtil from "@/backend/notification"
import { KeyEventCache } from '@/backend/keyEventCache'
import type { KeyEvent, KeyEventImage } from "@/types/billadm"

export const useKeyEventStore = defineStore('keyEvent', () => {
    const getLedgerId = () => useLedgerStore().currentLedgerId

    // ---- Reactive state (public, used by components) ----
    const datesWithRecords = ref(new Set<string>())
    const currentYear = ref(new Date().getFullYear())
    const titles = ref(new Map<string, string>())
    const colors = ref(new Map<string, string>())
    const images = ref<KeyEventImage[]>([])
    const events = ref<KeyEvent[]>([])

    // ---- Cache (deep module — 5 methods) ----
    const cache = new KeyEventCache()

    // ---- Public API ----

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
        } catch {
            return null;
        }
    };

    const saveEvent = async (date: string, title: string, content: string, color: string): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            await saveKeyEvent(date, title, content, color, ledgerId);
            datesWithRecords.value.add(date);
            const idx = events.value.findIndex(e => e.date === date);
            if (idx >= 0) {
                events.value[idx] = { ...events.value[idx]!, title, content, color };
            } else {
                events.value.push({
                    id: '', date, title, content, color,
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

    const deleteEvent = async (date: string): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            await deleteKeyEvent(date, ledgerId);
            datesWithRecords.value.delete(date);
            titles.value.delete(date);
            colors.value.delete(date);
            events.value = events.value.filter(e => e.date !== date);
            // Delegate cache cleanup to KeyEventCache
            cache.invalidate(date);
            images.value = [];
            NotificationUtil.success('删除成功');
        } catch (error) {
            NotificationUtil.error('删除失败', `${error}`);
            throw error;
        }
    };

    const hasRecord = (date: string): boolean => datesWithRecords.value.has(date);
    const getTitle = (date: string): string => titles.value.get(date) || '';
    const getColor = (date: string): string => colors.value.get(date) || '';
    const getEventByDate = (date: string): KeyEvent | null =>
        events.value.find(e => e.date === date) ?? null;

    const fetchImages = async (date: string): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        // Use cache
        const cached = cache.getImages(date)
        if (cached) {
            images.value = cached
            return
        }
        try {
            const result = await queryKeyEventImages(date, ledgerId);
            cache.setImages(date, result);
            images.value = result;
        } catch (error) {
            NotificationUtil.error('加载图片失败', `${error}`);
            images.value = [];
        }
    };

    const cacheLinkedTransactions = async (date: string): Promise<void> => {
        const trs = await withErrorHandling(
            () => fetchLinkedTransactions(date),
            { errorPrefix: '查询关联交易失败', fallback: [] }
        );
        cache.setTransactions(date, trs);
    };

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

            if (eventList.length === 0) return;
            await Promise.all([
                ...eventList.map(async (e) => {
                    try {
                        const imgs = await queryKeyEventImages(e.date, ledgerId);
                        cache.setImages(e.date, imgs);
                    } catch { /* ignore single failure */ }
                }),
                ...eventList.map(async (e) => {
                    try {
                        const trs = await withErrorHandling(
                            () => fetchLinkedTransactions(e.date),
                            { errorPrefix: '查询关联交易失败', fallback: [] }
                        );
                        cache.setTransactions(e.date, trs);
                    } catch { /* ignore single failure */ }
                }),
            ]);
        } catch (error) {
            NotificationUtil.error('预加载关键事件失败', `${error}`);
        }
    };

    const addImage = async (date: string, data: string, onProgress?: (percent: number) => void): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            const image = await addKeyEventImage(date, data, ledgerId, onProgress);
            images.value.push(image);
            const cached = cache.getImages(date);
            if (cached) {
                cached.push(image);
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
            if (target) {
                cache.invalidate(target.eventDate);
            }
        } catch (error) {
            NotificationUtil.error('删除图片失败', `${error}`);
            throw error;
        }
    };

    const clearImages = (): void => {
        cache.destroy();
        images.value = [];
    };

    return {
        // Reactive state
        datesWithRecords,
        currentYear,
        titles,
        colors,
        images,
        events,
        // Cache — exposed for component access (KeyEventImageGallery, KeyEventView)
        trCache: cache.trCache,
        // API
        fetchDatesByYear,
        fetchEventByDate,
        saveEvent,
        deleteEvent,
        hasRecord,
        getTitle,
        getColor,
        getEventByDate,
        fetchImages,
        addImage,
        removeImage,
        clearImages,
        preloadYearData,
        cacheLinkedTransactions,
    };
});
