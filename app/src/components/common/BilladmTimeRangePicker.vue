<!-- @/components/BilladmTimeRangePicker.vue -->
<template>
  <div class="billadm-time-range-picker">
    <a-segmented
        v-model:value="timeRangeTypeLabel"
        :options="Object.keys(TimeRangeLabelToValue)"
        @change="handleSegmentChange"
    />
    <a-button type="text" @click="goToPrevious">
      <template #icon>
        <LeftOutlined/>
      </template>
    </a-button>
    <a-range-picker
        v-model:value="timeRange"
        size="small"
        :picker="timeRangeTypeValue"
        :presets="getTimeRangePresets()"
        inputReadOnly
        @change="handleTimeRangeChange"
    />
    <a-button type="text" @click="goToNext">
      <template #icon>
        <RightOutlined/>
      </template>
    </a-button>
  </div>
</template>

<script setup lang="ts">
import {computed} from 'vue';
import {TimeRangeLabelToValue, TimeRangeValueToLabel} from '@/backend/constant.ts';
import {
  getLastMonthRange,
  getLastWeekRange,
  getNextPeriod,
  getPrevPeriod,
  getThisMonthRange,
  getThisWeekRange,
  getThisYearRange,
  getTodayRange,
  normalizeTimeRange
} from '@/backend/timerange.ts';
import {LeftOutlined, RightOutlined} from '@ant-design/icons-vue';
import type {RangeValue, TimeRangeTypeLabel, TimeRangeTypeValue} from '@/types/billadm';
import type {SegmentedValue} from "ant-design-vue/es/segmented/src/segmented";
import dayjs, {type Dayjs} from "dayjs";

const timeRange = defineModel<RangeValue>('timeRange', {required: true});
const timeRangeTypeValue = defineModel<TimeRangeTypeValue>('timeRangeType', {required: true});

const timeRangeTypeLabel = computed({
  get() {
    return TimeRangeValueToLabel[timeRangeTypeValue.value];
  },
  set(val) {
    timeRangeTypeValue.value = TimeRangeLabelToValue[val];
  }
});

const getTimeRangePresets = () => {
  return [
    {
      label: '今天',
      value: getTodayRange(),
    },
    {
      label: '本周',
      value: getThisWeekRange(),
    },
    {
      label: '本月',
      value: getThisMonthRange(),
    },
    {
      label: '上周',
      value: getLastWeekRange(),
    },
    {
      label: '上月',
      value: getLastMonthRange(),
    },
    {
      label: '今年',
      value: getThisYearRange(),
    }
  ];
}

// 上一周期
const goToPrevious = () => {
  if (!timeRange.value) {
    timeRange.value = [dayjs(), dayjs()];
  }
  timeRange.value = getPrevPeriod(timeRange.value[0], timeRange.value[1], timeRangeTypeValue.value);
};

// 下一周期
const goToNext = () => {
  if (!timeRange.value) {
    timeRange.value = [dayjs(), dayjs()];
  }
  timeRange.value = getNextPeriod(timeRange.value[0], timeRange.value[1], timeRangeTypeValue.value);
};

// 切换时间类型时 修改时间范围
const handleSegmentChange = (val: SegmentedValue) => {
  timeRange.value = normalizeTimeRange(timeRange.value, val as TimeRangeTypeLabel);
};

const handleTimeRangeChange = (val: [string, string] | [Dayjs, Dayjs], _: [string, string]) => {
  if (!val) {
    timeRange.value = undefined;
    return;
  }
  timeRange.value = normalizeTimeRange(val as RangeValue, timeRangeTypeLabel.value);
}
</script>

<style scoped>
.billadm-time-range-picker {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 32px;
}
</style>