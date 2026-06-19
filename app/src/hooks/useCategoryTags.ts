// src/hooks/useCategoryTags.ts
import { ref } from 'vue'
import type { DefaultOptionType } from 'ant-design-vue/es/vc-cascader'
import { getCategoryByType, getTagsByCategory } from '@/backend/functions'
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
    const list = await getCategoryByType(transactionType, ledgerId)
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
    const list = await getTagsByCategory(categoryTxType, ledgerId)
    tagOptions.value = list.map((t: Tag) => ({ value: t.name }))
    return list
  }

  function resetCategoryTags() {
    categoryOptions.value = []
    tagOptions.value = []
  }

  return { categoryOptions, tagOptions, loadCategoryOptions, loadTagOptions, resetCategoryTags }
}
