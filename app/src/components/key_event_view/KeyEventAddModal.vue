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
    </div>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';

interface Props {
  open: boolean;
  loading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'confirm', date: string, title: string): void;
  (e: 'close'): void;
}>();

const formDate = ref<Dayjs>(dayjs());
const formTitle = ref('');

watch(
  () => props.open,
  (val) => {
    if (val) {
      formDate.value = dayjs();
      formTitle.value = '';
    }
  },
);

const handleConfirm = () => {
  if (!formDate.value) return
  const date = formDate.value.format('YYYY-MM-DD');
  emit('confirm', date, formTitle.value.trim());
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
</style>
