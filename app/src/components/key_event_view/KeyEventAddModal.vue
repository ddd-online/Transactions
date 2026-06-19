<template>
  <a-modal
    :open="open"
    title="添加事件"
    ok-text="确认"
    cancel-text="取消"
    centered
    :width="360"
    :confirm-loading="loading"
    @ok="handleConfirm"
    @cancel="$emit('close')"
  >
    <div class="add-event-form">
      <label class="form-label">日期</label>
      <a-date-picker v-model:value="formDate" style="width: 100%" size="large" />

      <label class="form-label">名称</label>
      <a-input v-model:value="formTitle" placeholder="事件名称（可选）" :maxlength="200" size="large" />

      <label class="form-label">颜色</label>
      <div class="color-picker">
        <div
          v-for="c in EVENT_COLORS"
          :key="c"
          class="color-swatch"
          :class="{ 'is-selected': formColor === c }"
          :style="{ backgroundColor: c }"
          @click="formColor = c"
        >
          <CheckOutlined v-if="formColor === c" class="check-icon" />
        </div>
      </div>
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import { CheckOutlined } from '@ant-design/icons-vue';

const EVENT_COLORS = [
  '#D9705A', '#E89280', '#4A8C6F', '#6BAA8C',
  '#5C8DB5', '#7EABCC', '#C6963A', '#8C7B6E',
  '#9E8C7E', '#6B9E7E',
  '#8C6B9E', '#A88CC0', '#C68E30', '#D4A84B',
  '#5C9EA8', '#7EB8C2', '#B89A80', '#CCB098',
  '#7E8C94', '#9EAAB0',
];

const DEFAULT_COLOR = '#4A8C6F';

interface Props {
  open: boolean;
  loading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'confirm', date: string, title: string, color: string): void;
  (e: 'close'): void;
}>();

const formDate = ref<Dayjs>(dayjs());
const formTitle = ref('');
const formColor = ref(DEFAULT_COLOR);

watch(
  () => props.open,
  (val) => {
    if (val) {
      formDate.value = dayjs();
      formTitle.value = '';
      formColor.value = DEFAULT_COLOR;
    }
  },
);

const handleConfirm = () => {
  const date = formDate.value.format('YYYY-MM-DD');
  emit('confirm', date, formTitle.value.trim(), formColor.value);
};
</script>

<style scoped>
.add-event-form {
  display: flex;
  flex-direction: column;
  gap: var(--billadm-space-sm);
}

.form-label {
  font-size: var(--billadm-size-text-body);
  font-weight: 500;
  color: var(--billadm-color-text-major);
  margin-top: var(--billadm-space-sm);
}

.form-label:first-child {
  margin-top: 0;
}

.color-picker {
  display: flex;
  flex-direction: row;
  gap: 6px;
  flex-wrap: wrap;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: box-shadow var(--billadm-transition-fast), border-color var(--billadm-transition-fast);
  display: flex;
  align-items: center;
  justify-content: center;
}

.color-swatch:hover {
  box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.3);
}

.color-swatch.is-selected {
  border-color: #000;
}

.check-icon {
  color: #fff;
  font-size: 12px;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.4);
}
</style>
