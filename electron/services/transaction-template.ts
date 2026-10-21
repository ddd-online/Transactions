import { randomUUID } from 'node:crypto'

import { AppError } from '../../shared/errors'
import { TRANSACTION_TYPES } from '../../shared/domain/consts'
import type { TransactionTemplate } from '../../shared/domain/models'
import type { TransactionTemplateDto } from '../../shared/types/template'
import type { Db } from '../db/driver'
import {
  createTemplate,
  deleteTemplateById,
  getMaxSort,
  listTemplates,
  updateTemplateSort,
} from '../db/dao/transaction-template'

/** 模板校验失败沿既有行为收敛为 500（不是 400）。 */
function validate(dto: TransactionTemplateDto): void {
  if (!dto.templateName) throw new AppError('模板名称不能为空', { status: 500 })
  if (!(TRANSACTION_TYPES as readonly string[]).includes(dto.transactionType)) {
    throw new AppError(`invalid transaction type: ${dto.transactionType}`, { status: 500 })
  }
  if (!dto.category) throw new AppError('分类不能为空', { status: 500 })
}

function toTemplate(dto: TransactionTemplateDto, templateId: string, sortOrder: number): TransactionTemplate {
  return {
    templateId,
    ledgerId: dto.ledgerId,
    templateName: dto.templateName,
    transactionType: dto.transactionType,
    category: dto.category,
    tags: JSON.stringify(dto.tags),
    flags: dto.flags,
    description: dto.description,
    sortOrder,
    createdAt: 0,
    updatedAt: 0,
  }
}

export function createTemplateDto(db: Db, dto: TransactionTemplateDto): string {
  validate(dto)
  const templateId = randomUUID()
  createTemplate(db, toTemplate(dto, templateId, getMaxSort(db, dto.ledgerId) + 1))
  return templateId
}

export function deleteTemplate(db: Db, templateId: string): void {
  deleteTemplateById(db, templateId)
}

export function listTemplateDtos(db: Db, ledgerId: string): TransactionTemplateDto[] {
  return listTemplates(db, ledgerId).map((template) => ({
    templateId: template.templateId,
    ledgerId: template.ledgerId,
    templateName: template.templateName,
    transactionType: template.transactionType,
    category: template.category,
    tags: parseTags(template.tags),
    flags: template.flags,
    description: template.description,
    sortOrder: template.sortOrder,
  }))
}

export function updateTemplateSortOrder(db: Db, templateId: string, sortOrder: number): void {
  updateTemplateSort(db, templateId, sortOrder)
}

function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.map((tag) => String(tag)) : []
  } catch {
    return []
  }
}
