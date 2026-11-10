import type { Tag } from './models'

/**
 * 某分类 + 交易类型下的标签名（去重）。
 *
 * 标签在库里按 `分类:交易类型` 归档（见 {@link Tag.categoryTransactionType}），所以选项必须
 * 跟着分类走；跨分类把标签全列出来，会让人把别的分类的标签记到这条记录上。
 *
 * 记账页的新建表单、筛选条件与分析页的曲线条件共用这一条规则。
 */
export function tagNamesForCategory(
  tags: readonly Pick<Tag, 'name' | 'categoryTransactionType'>[],
  category: string,
  transactionType: string,
): string[] {
  const key = `${category.trim()}:${transactionType}`
  return Array.from(
    new Set(
      tags.filter((tag) => tag.categoryTransactionType === key).map((tag) => tag.name),
    ),
  )
}

/**
 * 筛选条件里的标签候选：分类与消费类型都是**可选**的一端（空串 = 不限）。
 *
 * 不能直接用 {@link tagNamesForCategory}：那个把空分类当成「还没有分类」、返回空表（新建
 * 表单就是这样用的，没分类的标签无处安放）；筛选却可以不限分类。所以这里两端都是可选
 * 收窄 —— 只选类型时列出这类记录的全部标签，只选分类时列出这个分类下所有类型的标签。
 */
export function tagNamesForFilter(
  tags: readonly Pick<Tag, 'name' | 'categoryTransactionType'>[],
  category: string,
  transactionType: string,
): string[] {
  const categoryPrefix = category.trim() === '' ? '' : `${category.trim()}:`
  const typeSuffix = transactionType === '' ? '' : `:${transactionType}`
  return Array.from(
    new Set(
      tags
        .filter(
          (tag) =>
            tag.categoryTransactionType.startsWith(categoryPrefix) &&
            tag.categoryTransactionType.endsWith(typeSuffix),
        )
        .map((tag) => tag.name),
    ),
  )
}
