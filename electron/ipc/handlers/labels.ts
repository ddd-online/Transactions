/**
 * 分类、标签与记账模板命令。
 *
 * 三者的读写都只依赖账本 ID 与名称 / 排序，放在同一个领域文件里，避免为几条命令
 * 各建一个几十行的文件。
 */
import { AppError } from '../../../shared/errors'
import * as categoryService from '../../services/category'
import * as tagService from '../../services/tag'
import {
  createTemplateDto,
  deleteTemplate,
  listTemplateDtos,
  updateTemplateSortOrder,
} from '../../services/transaction-template'
import type { HandlerMap } from '../commands'
import { asObject, workspaceDb, type HandlerContext } from './context'

export function createLabelHandlers(
  _ctx: HandlerContext,
): Pick<
  HandlerMap,
  | 'category_list'
  | 'category_create'
  | 'category_delete'
  | 'category_update_sort'
  | 'category_initialize'
  | 'tag_list'
  | 'tag_create'
  | 'tag_delete'
  | 'tag_update_sort'
  | 'template_create'
  | 'template_list'
  | 'template_delete'
  | 'template_update_sort'
> {
  return {
    category_list(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledgerId ?? '')
      if (!ledgerId) return []
      const transactionType = String(raw.type ?? raw.transactionType ?? '')
      const db = workspaceDb()
      const categories = categoryService.queryCategory(db, ledgerId, transactionType)
      const counts = categoryService.countRecordsByCategories(
        db,
        ledgerId,
        categories.map((category) => category.name),
      )
      return categories.map((category) => ({
        ...category,
        recordCount: counts[category.name] ?? 0,
      }))
    },

    category_create(request) {
      const raw = asObject(request)
      categoryService.createCategory(
        workspaceDb(),
        String(raw.ledgerId ?? ''),
        String(raw.name ?? ''),
        String(raw.transactionType ?? ''),
      )
      return null
    },

    category_delete(request) {
      const raw = asObject(request)
      const name = String(raw.name ?? '')
      const transactionType = String(raw.type ?? raw.transactionType ?? '')
      const ledgerId = String(raw.ledgerId ?? '')
      if (!name || !transactionType || !ledgerId) {
        throw new AppError('missing required parameters', { status: 400 })
      }
      categoryService.deleteCategory(workspaceDb(), ledgerId, name, transactionType)
      return null
    },

    category_update_sort(request) {
      const raw = asObject(request)
      categoryService.updateCategorySort(
        workspaceDb(),
        String(raw.ledgerId ?? ''),
        String(raw.name ?? ''),
        String(raw.transactionType ?? ''),
        Number(raw.sortOrder ?? 0),
      )
      return null
    },

    category_initialize(request) {
      const ledgerId = String(asObject(request).ledgerId ?? '')
      if (!ledgerId) throw new AppError('缺少 ledgerId 参数', { status: 400 })
      const [categories, tags] = categoryService.initializeCategories(workspaceDb(), ledgerId)
      return { categories, tags }
    },

    tag_list(request) {
      const raw = asObject(request)
      const ledgerId = String(raw.ledgerId ?? '')
      if (!ledgerId) return []
      const categoryTransactionType = String(raw.categoryTransactionType ?? '')
      const db = workspaceDb()
      const tags = tagService.queryTags(db, ledgerId, categoryTransactionType)
      const counts = tagService.countRecordsByTags(
        db,
        ledgerId,
        tags.map((tag) => tag.name),
      )
      return tags.map((tag) => ({ ...tag, recordCount: counts[tag.name] ?? 0 }))
    },

    tag_create(request) {
      const raw = asObject(request)
      tagService.createTag(
        workspaceDb(),
        String(raw.ledgerId ?? ''),
        String(raw.name ?? ''),
        String(raw.categoryTransactionType ?? ''),
      )
      return null
    },

    tag_delete(request) {
      const raw = asObject(request)
      const name = String(raw.name ?? '')
      const categoryTransactionType = String(raw.categoryTransactionType ?? '')
      const ledgerId = String(raw.ledgerId ?? '')
      if (!name || !categoryTransactionType || !ledgerId) {
        throw new AppError('missing required parameters', { status: 400 })
      }
      tagService.deleteTag(workspaceDb(), ledgerId, name, categoryTransactionType)
      return null
    },

    tag_update_sort(request) {
      const raw = asObject(request)
      tagService.updateTagSort(
        workspaceDb(),
        String(raw.ledgerId ?? ''),
        String(raw.name ?? ''),
        String(raw.categoryTransactionType ?? ''),
        Number(raw.sortOrder ?? 0),
      )
      return null
    },

    template_create(request) {
      const raw = asObject(request)
      return createTemplateDto(workspaceDb(), {
        templateId: String(raw.template_id ?? ''),
        ledgerId: String(raw.ledger_id ?? ''),
        templateName: String(raw.template_name ?? ''),
        transactionType: String(raw.transaction_type ?? ''),
        category: String(raw.category ?? ''),
        tags: Array.isArray(raw.tags) ? raw.tags.map((tag) => String(tag)) : [],
        flags: String(raw.flags ?? ''),
        description: String(raw.description ?? ''),
        sortOrder: Number(raw.sort_order ?? 0),
      })
    },

    template_list(request) {
      const ledgerId = String(asObject(request).ledger_id ?? '')
      if (!ledgerId) throw new AppError('missing ledgerId', { status: 400 })
      return listTemplateDtos(workspaceDb(), ledgerId)
    },

    template_delete(request) {
      const raw = asObject(request)
      const templateId = String(raw.id ?? raw.templateId ?? '')
      if (!templateId) throw new AppError('missing template id', { status: 400 })
      deleteTemplate(workspaceDb(), templateId)
      return null
    },

    template_update_sort(request) {
      const raw = asObject(request)
      const templateId = String(raw.id ?? '')
      if (!templateId) throw new AppError('missing template id', { status: 400 })
      updateTemplateSortOrder(workspaceDb(), templateId, Number(raw.sortOrder ?? 0))
      return null
    },
  }
}
