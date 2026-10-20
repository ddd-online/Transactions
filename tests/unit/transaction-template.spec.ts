import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { closeWorkspace, openWorkspace } from '../../electron/db'
import { AppError } from '../../shared/errors'
import {
  createTemplateDto,
  deleteTemplate,
  listTemplateDtos,
  updateTemplateSortOrder,
} from '../../electron/services/transaction-template'
import type { TransactionTemplateDto } from '../../shared/types/template'

const directories: string[] = []

function workspaceDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), 'tr-template-test-'))
  directories.push(directory)
  return directory
}

afterEach(() => {
  closeWorkspace()
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

function dto(name: string): TransactionTemplateDto {
  return {
    templateId: '',
    ledgerId: 'l1',
    templateName: name,
    transactionType: 'expense',
    category: '餐饮美食',
    tags: ['三餐', '外卖'],
    flags: 'flag',
    description: '午餐',
    sortOrder: 0,
  }
}

describe('transaction templates', () => {
  it('creates, lists, sorts and deletes templates', () => {
    const db = openWorkspace(workspaceDirectory()).db
    const first = createTemplateDto(db, dto('模板甲'))
    const second = createTemplateDto(db, dto('模板乙'))
    expect(first).not.toBe(second)

    const rows = listTemplateDtos(db, 'l1')
    expect(rows.map((row) => row.templateId)).toEqual([first, second])
    expect(rows[0]).toMatchObject({
      templateName: '模板甲',
      tags: ['三餐', '外卖'],
      flags: 'flag',
      description: '午餐',
      sortOrder: 1,
    })

    updateTemplateSortOrder(db, first, 9)
    expect(listTemplateDtos(db, 'l1')[1].sortOrder).toBe(9)

    deleteTemplate(db, first)
    expect(listTemplateDtos(db, 'l1')).toHaveLength(1)
  })

  it('keeps the old validation messages and 500 status', () => {
    const db = openWorkspace(workspaceDirectory()).db
    for (const [patch, message] of [
      [{ templateName: '' }, '模板名称不能为空'],
      [{ transactionType: 'bad' }, 'invalid transaction type: bad'],
      [{ category: '' }, '分类不能为空'],
    ] as const) {
      try {
        createTemplateDto(db, { ...dto('模板'), ...patch })
        throw new Error('应当失败')
      } catch (error) {
        expect(error).toBeInstanceOf(AppError)
        expect((error as AppError).status).toBe(500)
        expect((error as AppError).message).toBe(message)
      }
    }
  })

  it('stores tags as a JSON array string', () => {
    const db = openWorkspace(workspaceDirectory()).db
    createTemplateDto(db, dto('模板'))
    const row = db
      .prepare('SELECT tags FROM transaction_template')
      .get() as { tags: string }
    expect(row.tags).toBe('["三餐","外卖"]')
  })
})
