// src/hooks/useCategoryTags.ts
import { ref } from 'vue'
import type { DefaultOptionType } from 'ant-design-vue/es/vc-cascader'
import { withErrorHandling } from '@/backend/errorHandler'
import { queryCategory } from '@/backend/api/category'
import { queryTags } from '@/backend/api/tag'
import type { Category, Tag } from '@/types/billadm'

export function useCategoryTags(getLedgerId: () => string | undefined | null) {
  const categoryOptions = ref<DefaultOptionType[]>([])
  const tagOptions = ref<DefaultOptionType[]>([])

  async function loadCategoryOptions(transactionType: string): Promise<Category[]> {
    const ledgerId = getLedgerId()
    if (!ledgerId || !transactionType) {
      categoryOptions.value = []
      return []
    }
    const list = await withErrorHandling(
      () => queryCategory(transactionType, ledgerId),
      { errorPrefix: `查询 ${transactionType} 消费类型失败`, fallback: [] as Category[] }
    )
    categoryOptions.value = list.map((c: Category) => ({ value: c.name }))
    return list
  }

  async function loadTagOptions(category: string, transactionType: string): Promise<Tag[]> {
    const ledgerId = getLedgerId()
    if (!ledgerId || !category || !transactionType) {
      tagOptions.value = []
      return []
    }
    const categoryTxType = `${category}:${transactionType}`
    const list = await withErrorHandling(
      () => queryTags(categoryTxType, ledgerId),
      { errorPrefix: `查询 ${categoryTxType} 消费标签失败`, fallback: [] as Tag[] }
    )
    tagOptions.value = list.map((t: Tag) => ({ value: t.name }))
    return list
  }

  function resetCategoryTags() {
    categoryOptions.value = []
    tagOptions.value = []
  }

  return { categoryOptions, tagOptions, loadCategoryOptions, loadTagOptions, resetCategoryTags }
}
