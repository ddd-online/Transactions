<!-- @/components/TransactionsFileSelect.vue -->
<template>
  <a-modal v-model:open="open" :title="title" ok-text="确认" cancel-text="取消" @ok="handleOk" @cancel="handleCancel"
    :closable="false" :esc-to-close="false" :mask-closable="false" centered>
    <a-input-search v-model:value="inputPath" :placeholder="placeholder" enter-button="打开目录" @search="handleBrowse" />
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import NotificationUtil from '@/backend/notification.ts'

// 定义 props
interface Props {
  title: string
  /**
   * 选择模式：'file' 表示选择文件，'directory' 表示选择目录
   */
  mode?: 'file' | 'directory'
  /**
   * 输入框占位符
   */
  placeholder?: string
}

const props = withDefaults(defineProps<Props>(), {
  mode: 'directory',
  placeholder: '请选择路径',
})

// 定义 emits
const emit = defineEmits<{
  (e: 'confirm', path: string): void
  (e: 'cancel'): void
}>()

const open = defineModel<boolean>()

// 输入框路径
const inputPath = ref('')

// 监听打开状态，重置输入框
watch(open, (newVal) => {
  if (newVal) {
    inputPath.value = ''
  }
})

// 浏览目录
const handleBrowse = async () => {
  try {
    const result = await window.electronAPI.openDialog({
      properties: props.mode === 'file' ? ['openFile'] : ['openDirectory'],
    })

    if (!result.canceled && result.filePaths && result.filePaths.length > 0) {
      inputPath.value = result.filePaths[0]!
    }
  } catch (error) {
    NotificationUtil.error('选择路径失败', `${error}`)
  }
}

// 确认回调
const handleOk = () => {
  if (!inputPath.value) {
    NotificationUtil.error('路径为空', '请选择一个有效的路径')
    return
  }
  emit('confirm', inputPath.value)
  open.value = false
}

// 取消回调
const handleCancel = () => {
  emit('cancel')
}
</script>