import {defineStore} from "pinia";
import {ref} from "vue";
import type {TrStatistics} from "@/types/transactions";

export const useAppDataStore = defineStore('appDataStore', () => {

    const income = ref<number>(0);
    const expense = ref<number>(0);
    const transfer = ref<number>(0);

    const setStatistics = (data: TrStatistics) => {
        income.value = data.income;
        expense.value = data.expense;
        transfer.value = data.transfer;
    }


    return {
        income,
        expense,
        transfer,
        setStatistics,
    }
})