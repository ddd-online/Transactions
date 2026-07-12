import { defineStore } from 'pinia'
import { ref } from 'vue'
import { fetchDates, fetchDiary, saveDiary as apiSaveDiary, deleteDiary as apiDeleteDiary } from '@/backend/api/diary'
import { tryOrFallback, withErrorHandling } from '@/backend/errorHandler'
import NotificationUtil from '@/backend/notification'
import type { DiaryEntry, DiaryDateItem } from '@/types/billadm'

export const useDiaryStore = defineStore('diary', () => {
    // ---- Reactive state ----
    const dates = ref<DiaryDateItem[]>([])
    const currentEntry = ref<DiaryEntry | null>(null)
    const saveStatus = ref<'idle' | 'saving' | 'saved' | 'error'>('idle')

    // ---- Actions ----

    /** 加载所有日记日期列表（用于构建左侧树） */
    const loadDates = async () => {
        dates.value = await tryOrFallback(() => fetchDates(), [] as DiaryDateItem[])
    }

    /** 加载某天的日记到 currentEntry */
    const loadEntry = async (date: string) => {
        const emptyEntry: DiaryEntry = { id: '', date, content: '', mood: '', wordCount: 0, createdAt: 0, updatedAt: 0 }
        currentEntry.value = await tryOrFallback(() => fetchDiary(date), emptyEntry)
    }

    /** 保存当前日记 */
    const saveEntry = async (date: string, content: string, mood: string) => {
        saveStatus.value = 'saving'
        try {
            const saved = await withErrorHandling(
                () => apiSaveDiary(date, content, mood),
                { errorPrefix: '保存日记失败', rethrow: true }
            )
            currentEntry.value = saved
            saveStatus.value = 'saved'
            // 更新 dates 列表（server-computed wordCount）
            const idx = dates.value.findIndex(d => d.date === date)
            const item: DiaryDateItem = { date, wordCount: saved.wordCount, mood }
            if (idx >= 0) {
                dates.value[idx] = item
            } else {
                dates.value.push(item)
                dates.value.sort((a, b) => b.date.localeCompare(a.date))
            }
        } catch {
            saveStatus.value = 'error'
        }
    }

    /** 删除某天的日记 */
    const removeEntry = async (date: string) => {
        await withErrorHandling(
            () => apiDeleteDiary(date),
            { errorPrefix: '删除日记失败', rethrow: true }
        )
        dates.value = dates.value.filter(d => d.date !== date)
        if (currentEntry.value?.date === date) {
            currentEntry.value = null
        }
        NotificationUtil.success('日记已删除')
    }

    return {
        dates,
        currentEntry,
        saveStatus,
        loadDates,
        loadEntry,
        saveEntry,
        removeEntry,
    }
})
