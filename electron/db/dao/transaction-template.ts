import type { Db } from '../driver'
import type { TransactionTemplate } from '../../../shared/domain/models'

const COLUMNS =
  'template_id, ledger_id, template_name, transaction_type, category, tags, flags, description, sort_order, created_at, updated_at'

function fromRow(row: Record<string, unknown>): TransactionTemplate {
  return {
    templateId: String(row.template_id ?? ''),
    ledgerId: String(row.ledger_id ?? ''),
    templateName: String(row.template_name ?? ''),
    transactionType: String(row.transaction_type ?? ''),
    category: String(row.category ?? ''),
    tags: String(row.tags ?? '[]'),
    flags: String(row.flags ?? ''),
    description: String(row.description ?? ''),
    sortOrder: Number(row.sort_order ?? 0),
    createdAt: Number(row.created_at ?? 0),
    updatedAt: Number(row.updated_at ?? 0),
  }
}

export function createTemplate(db: Db, template: TransactionTemplate, now = nowUnix()): void {
  db.prepare(
    `INSERT INTO transaction_template
     (template_id, ledger_id, template_name, transaction_type, category, tags, flags, description, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    template.templateId,
    template.ledgerId,
    template.templateName,
    template.transactionType,
    template.category,
    template.tags,
    template.flags,
    template.description,
    template.sortOrder,
    now,
    now,
  )
}

export function deleteTemplateById(db: Db, templateId: string): void {
  db.prepare('DELETE FROM transaction_template WHERE template_id = ?').run(templateId)
}

export function getMaxSort(db: Db, ledgerId: string): number {
  const row = db
    .prepare(
      'SELECT COALESCE(MAX(sort_order), 0) AS max_sort FROM transaction_template WHERE ledger_id = ?',
    )
    .get(ledgerId) as { max_sort: number } | undefined
  return row?.max_sort ?? 0
}

export function listTemplates(db: Db, ledgerId: string): TransactionTemplate[] {
  const rows = db
    .prepare(
      `SELECT ${COLUMNS} FROM transaction_template WHERE ledger_id = ? ORDER BY sort_order ASC, created_at DESC`,
    )
    .all(ledgerId) as Array<Record<string, unknown>>
  return rows.map(fromRow)
}

export function updateTemplateSort(
  db: Db,
  templateId: string,
  sortOrder: number,
  now = nowUnix(),
): void {
  db.prepare('UPDATE transaction_template SET sort_order = ?, updated_at = ? WHERE template_id = ?').run(
    sortOrder,
    now,
    templateId,
  )
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000)
}
