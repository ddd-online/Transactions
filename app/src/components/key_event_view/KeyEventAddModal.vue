<template>
  <a-modal :open="open" title="添加事件" ok-text="确认" cancel-text="取消" centered :width="360" :confirm-loading="loading"
    @ok="handleConfirm" @cancel="$emit('close')">
    <a-form ref="formRef" :model="formState" :rules="formRules" layout="vertical">
      <a-form-item label="日期" name="date">
        <a-date-picker v-model:value="formDate" style="width: 100%" />
      </a-form-item>
      <a-form-item label="名称" name="title">
        <a-input v-model:value="formTitle" placeholder="事件名称（可选）" :maxlength="200" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, reactive, watch } from 'vue';
import dayjs from 'dayjs';
import type { Dayjs } from 'dayjs';
import type { FormInstance } from 'ant-design-vue';

interface Props {
  open: boolean;
  loading: boolean;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  (e: 'confirm', date: string, title: string): void;
  (e: 'close'): void;
}>();

const formRef = ref<FormInstance>();
const formDate = ref<Dayjs>(dayjs());
const formTitle = ref('');

const formState = reactive({ date: '', title: '' });
const formRules = {
  date: [{ required: true, message: '请选择日期' }],
};

watch(
  () => props.open,
  (val) => {
    if (val) {
      formDate.value = dayjs();
      formTitle.value = '';
      formState.date = formDate.value.format('YYYY-MM-DD');
    }
  },
);

// 选择日期后同步到 formState，否则表单验证会报"请选择日期"
watch(formDate, (val) => {
  formState.date = val ? val.format('YYYY-MM-DD') : '';
});

const handleConfirm = async () => {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (!formDate.value) return;
  const date = formDate.value.format('YYYY-MM-DD');
  emit('confirm', date, formTitle.value.trim());
};
</script>

<style scoped></style>
