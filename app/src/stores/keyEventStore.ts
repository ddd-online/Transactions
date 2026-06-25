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
import type { KeyEvent, KeyEventImage } from "@/types/billadm";

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

    const fetchImages = async (date: string): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            images.value = await queryKeyEventImages(date, ledgerId);
        } catch (error) {
            NotificationUtil.error('加载图片失败', `${error}`);
            images.value = [];
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
        } catch (error) {
            NotificationUtil.error('添加图片失败', `${error}`);
            throw error;
        }
    };

    const removeImage = async (imageId: string): Promise<void> => {
        const ledgerId = getLedgerId()
        if (!ledgerId) return
        try {
            await deleteKeyEventImage(imageId, ledgerId);
            images.value = images.value.filter(img => img.id !== imageId);
        } catch (error) {
            NotificationUtil.error('删除图片失败', `${error}`);
            throw error;
        }
    };

    const clearImages = (): void => {
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
        images,
        events,
        fetchImages,
        addImage,
        removeImage,
        clearImages,
    };
});
