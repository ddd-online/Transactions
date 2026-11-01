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
