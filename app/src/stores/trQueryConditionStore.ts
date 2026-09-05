import {computed, ref} from "vue"
import {defineStore} from 'pinia'
import {getThisMonthRange} from "@/backend/timerange.ts"
import type {TrQueryConditionItem, RangeValue, TimeRangeTypeValue} from "@/types/transactions"

export const useTrQueryConditionStore = defineStore('trQueryCondition', () => {

    // 时间范围默认对齐「本月」；分段标签必须与范围一致，避免出现“显示为日、查的却是整月”的错位
    const timeRange = ref<RangeValue>(getThisMonthRange()); // 时间范围
    const timeRangeType = ref('month' as TimeRangeTypeValue); // 时间类型标签
    const transactionTypes = ref<string[]>([]);
    const trQueryConditionItems = ref<TrQueryConditionItem[]>([]);


    const conditionLen = computed(() => {
        return trQueryConditionItems.value.length;
    });

    return {
        timeRange,
        timeRangeType,
        transactionTypes,
        trQueryConditionItems,
        conditionLen
    }
})
