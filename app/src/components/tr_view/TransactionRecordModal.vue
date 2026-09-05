<template>
  <a-modal :title="modalTitle" :open="open" width="800px" @ok="handleConfirm" ok-text="确认" @cancel="handleClose"
    cancel-text="取消" centered :confirm-loading="saving">
    <a-form ref="formRef" :model="trForm" :rules="rules">
      <a-form-item label="模板">
        <div class="template-select-row">
          <a-select v-model:value="selectedTemplateId" :options="templateOptions" placeholder="选择模板后自动填充"
            class="template-select" allowClear />
          <a-button @click="handleSaveAsTemplate" :disabled="!trForm.type || !trForm.category">
            保存为模板
          </a-button>
        </div>
      </a-form-item>

      <a-form-item label="日期" name="time">
        <a-date-picker v-model:value="trForm.time" style="width: 100%" />
      </a-form-item>

      <a-form-item label="类型" name="type">
        <a-segmented v-model:value="trForm.type" :options="typeOptions" />
      </a-form-item>

      <a-form-item label="分类" name="category">
        <a-select v-model:value="trForm.category" :options="categoryOptions" />
        <div v-if="categoryOptions.length === 0 && trForm.type" class="category-empty-hint">
          该类型还没有分类，请先在「分类标签」页添加分类或初始化默认分类。
        </div>
      </a-form-item>

      <a-form-item label="标签" name="tags">
        <a-select v-model:value="trForm.tags" :options="tagOptions" mode="multiple" placeholder="选择一个或多个标签" />
      </a-form-item>

      <a-form-item label="标记" name="flags">
        <a-checkbox-group v-model:value="trForm.flags" :options="flagOptions" />
      </a-form-item>

      <a-form-item label="描述" name="description">
        <a-input v-model:value="trForm.description" placeholder="描述消费内容" allowClear />
      </a-form-item>

      <a-form-item label="金额" name="price">
        <a-input v-model:value="trForm.price" prefix="￥" style="width: 100%" />
      </a-form-item>
    </a-form>
  </a-modal>

  <a-modal v-model:open="openSaveTemplateModal" title="保存为模板" @ok="handleConfirmSaveTemplate" ok-text="保存"
    cancel-text="取消" centered>
    <a-form>
      <a-form-item label="模板名称">
        <a-input v-model:value="templateName" placeholder="请输入模板名称" />
      </a-form-item>
    </a-form>
  </a-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import dayjs, { type Dayjs } from 'dayjs'
import type { FormInstance } from 'ant-design-vue/es/form'
import type { Rule } from 'ant-design-vue/es/form'
import { message } from 'ant-design-vue'
import type { TransactionRecord, TrForm } from '@/types/transactions'
import { withErrorHandling } from '@/backend/errorHandler'
import { createTrForLedger, deleteTrById } from '@/backend/api/tr'
import { createTemplate } from '@/backend/api/template'
import { useCategoryTags } from '@/hooks/useCategoryTags'
import { useTransactionStore } from '@/stores/transactionStore'
import { storeToRefs } from 'pinia'
import { trDtoToTrForm, trFormToTrDto } from '@/backend/dto-utils'

const props = defineProps<{
  open: boolean
  record: TransactionRecord | null
  currentLedgerId: string
  defaultDate?: Dayjs
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'saved'): void
}>()

const transactionStore = useTransactionStore()
const { templates, templateOptions } = storeToRefs(transactionStore)
const { loadTemplates } = transactionStore

const { categoryOptions, tagOptions, loadCategoryOptions, loadTagOptions } =
  useCategoryTags(() => props.currentLedgerId)

const rules: Record<string, Rule[]> = {
  price: [
    { trigger: 'blur' },
    {
      validator: (_: any, value: string) => {
        if (!value) return Promise.reject(new Error('请输入金额'))
        const regex = /^(0|[1-9]\d*)(\.\d{1,2})?$/
        if (!regex.test(value)) {
          return Promise.reject(new Error('请输入 ≥0 的有效金额，最多两位小数'))
        }
        return Promise.resolve()
      },
      trigger: 'blur',
    },
  ],
}

const formRef = ref<FormInstance>()
const trForm = ref<TrForm>(createEmptyForm())
// 提交中状态：防止重复提交；编辑保存改为「先创建新记录、成功后再删除旧记录」，
// 避免旧记录被删除后新记录创建失败造成数据丢失
const saving = ref(false)

const selectedTemplateId = ref<string | undefined>()
const openSaveTemplateModal = ref(false)
const templateName = ref('')

const typeOptions = [
  { label: '收入', value: 'income' },
  { label: '支出', value: 'expense' },
  { label: '转账', value: 'transfer' },
]

const flagOptions = [{ label: '离群值', value: 'outlier' }]

const modalTitle = computed(() => props.record ? '编辑消费记录' : '新增消费记录')

function createEmptyForm(date?: Dayjs): TrForm {
  return { id: '', price: '', type: '', category: '', description: '', tags: [], flags: [], time: date ?? dayjs() }
}

watch(() => props.open, async (val) => {
  if (!val) return
  if (props.record) {
    trForm.value = trDtoToTrForm(props.record)
  } else {
    trForm.value = createEmptyForm(props.defaultDate)
    trForm.value.type = 'expense'
    if (props.currentLedgerId) {
      const categories = await loadCategoryOptions('expense')
      const first = categories[0]
      if (first) {
        trForm.value.category = first.name
      }
    }
  }
  selectedTemplateId.value = undefined
})

watch(() => props.currentLedgerId, () => {
  loadTemplates()
}, { immediate: true })

watch(() => trForm.value.type, async (newType) => {
  if (!newType || !props.currentLedgerId) return
  const categoryList = await loadCategoryOptions(newType)
  const categoryNames = categoryList.map(c => c.name)
  if (categoryNames.length > 0) {
    if (!trForm.value.category || !categoryNames.includes(trForm.value.category)) {
      trForm.value.category = categoryNames[0] as string
    }
  } else {
    trForm.value.category = ''
  }
})

watch(categoryOptions, (newOptions) => {
  if (newOptions.length > 0 && (!trForm.value.category || !newOptions.some(o => o.value === trForm.value.category))) {
    const first = newOptions[0]
    if (first) trForm.value.category = first.value as string
  }
})

watch(() => trForm.value.category, async (newCategory) => {
  if (!newCategory || !trForm.value.type || !props.currentLedgerId) return
  await loadTagOptions(newCategory, trForm.value.type)
  const tagNames = tagOptions.value.map(t => t.value as string)
  if (tagNames.length > 0 && trForm.value.tags) {
    trForm.value.tags = trForm.value.tags.filter(tag => tagNames.includes(tag))
  } else {
    trForm.value.tags = []
  }
})

watch(selectedTemplateId, (newId) => {
  if (!newId) return
  const template = templates.value.find(t => t.template_id === newId)
  if (!template) return
  trForm.value.type = template.transaction_type
  trForm.value.category = template.category
  trForm.value.tags = [...template.tags]
  trForm.value.flags = template.flags ? [template.flags] : []
  trForm.value.description = template.description
})

const handleClose = () => {
  emit('close')
}

const handleConfirm = async () => {
  if (saving.value) return
  try {
    await formRef.value?.validate()
  } catch {
    return
  }

  trForm.value.time = trForm.value.time.hour(12).minute(0).second(0)
  const tr = trFormToTrDto(trForm.value, props.currentLedgerId)

  saving.value = true
  try {
    if (tr.transactionId === '') {
      if (!tr.description) tr.description = '-'
      await withErrorHandling(
        () => createTrForLedger(tr),
        { errorPrefix: '创建消费记录失败', rethrow: true }
      )
    } else {
      // 编辑 = 删除 + 重建（后端无单条更新接口）。顺序必须是先建后删：
      // 新建成功再删除旧记录；若删除失败，尝试回滚新建，避免静默留下重复记录。
      const oldId = tr.transactionId
      const newId = await withErrorHandling(
        () => createTrForLedger(tr),
        { errorPrefix: '保存修改失败', rethrow: true }
      )
      try {
        await withErrorHandling(
          () => deleteTrById(oldId),
          { errorPrefix: '删除旧记录失败', rethrow: true }
        )
      } catch (deleteError) {
        try {
          await deleteTrById(newId)
        } catch {
          message.error('新记录已保存，但旧记录清理失败，请手动删除重复记录')
        }
        throw deleteError
      }
    }
    emit('saved')
    emit('close')
  } catch {
    // 错误已由 withErrorHandling 通知
  } finally {
    saving.value = false
  }
}

const handleSaveAsTemplate = () => {
  templateName.value = ''
  openSaveTemplateModal.value = true
}

const handleConfirmSaveTemplate = async () => {
  if (!templateName.value.trim()) return
  if (!props.currentLedgerId) return
  const data = {
    ledger_id: props.currentLedgerId,
    template_name: templateName.value.trim(),
    transaction_type: trForm.value.type,
    category: trForm.value.category,
    tags: trForm.value.tags,
    flags: trForm.value.flags.join(','),
    description: trForm.value.description,
  }
  try {
    await withErrorHandling(
      () => createTemplate(data),
      { errorPrefix: '保存模板失败', rethrow: true }
    )
    message.success('保存模板成功')
    openSaveTemplateModal.value = false
    await loadTemplates()
  } catch { /* 错误已在 withErrorHandling 中通知 */ }
}
</script>

<style scoped>
.template-select-row {
  display: flex;
  gap: var(--transactions-space-sm);
  align-items: center;
}

.template-select {
  flex: 1;
}

.category-empty-hint {
  margin-top: var(--transactions-space-xs);
  font-size: var(--transactions-size-text-caption);
  line-height: var(--transactions-height-snug);
  color: var(--transactions-color-text-tertiary);
}
</style>
