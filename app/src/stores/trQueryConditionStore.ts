import {computed, ref} from "vue"
import {defineStore} from 'pinia'
import {getThisMonthRange} from "@/backend/timerange.ts"
import type {TrQueryConditionItem, RangeValue, TimeRangeTypeValue} from "@/types/transactions"

export const useTrQueryConditionStore = defineStore('trQueryCondition', () => {

    const timeRange = ref<RangeValue>(getThisMonthRange()); // 时间范围
    const timeRangeType = ref('date' as TimeRangeTypeValue); // 时间类型标签
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