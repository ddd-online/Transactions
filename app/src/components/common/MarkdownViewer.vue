<template>
  <div class="markdown-viewer" v-html="renderedHtml"></div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { renderMarkdown } from '@/utils/markdown'

const props = defineProps<{ content: string }>()

// 缓存渲染结果：流式回答时仅当前消息内容变化才触发重算，
// 避免整屏消息每次渲染都重新执行 marked + DOMPurify + highlight。
const renderedHtml = computed(() => renderMarkdown(props.content))
</script>

<style scoped>
.markdown-viewer {
  /* 纯容器：具体 markdown 元素样式由父组件的 :deep() 覆盖，保持日记/对话各自风格 */
  min-width: 0;
}
</style>
