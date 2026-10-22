import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test } from '@playwright/test'

import { createLedger } from './ledger-helper'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

function ymd(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

test('记录操作：编辑 / 事件日期 / 同步到其他账本 / 删除', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-record-actions-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repositoryRoot,
    env: environment({
      USERPROFILE: home,
      HOME: home,
      TRANSACTIONS_USER_DATA: userData,
      TRANSACTIONS_TEST_DIALOG_DIR: workspace,
      TRANSACTIONS_TEST_CLOSE: 'quit',
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')

    await createLedger(page, '甲账本')
    await page.getByTestId('nav-accounting').click()
    await page.getByTestId('acct-tab-records').click()

    await page.getByTestId('tr-new').click()
    await page.getByTestId('tr-amount').fill('12.34')
    await page.getByTestId('tr-category').fill('餐饮美食')
    await page.getByTestId('tr-description').fill('午餐')
    await page.getByTestId('tr-save').click()
    await expect(page.getByTestId('tr-row')).toContainText('午餐')
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'record-actions-row.png'),
    })

    // ---- 编辑：改金额与描述，仍只有一条记录 ----
    await page.getByTestId('tr-edit').click()
    await expect(page.getByRole('dialog', { name: '编辑记录' })).toBeVisible()
    await page.getByTestId('tr-amount').fill('20.00')
    await page.getByTestId('tr-description').fill('午餐改')
    await page.getByTestId('tr-save').click()
    await expect(page.getByTestId('tr-row')).toContainText('午餐改')
    await expect(page.getByTestId('tr-row')).toContainText('-20.00')

    let database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    let records = database
      .prepare('SELECT amount_cents, description FROM transaction_record ORDER BY amount_cents')
      .all() as Array<{ amount_cents: number; description: string }>
    database.close()
    expect(records).toEqual([{ amount_cents: 2000, description: '午餐改' }])

    // ---- 关联事件日期在编辑弹窗里维护 ----
    const today = ymd(new Date())
    await page.getByTestId('tr-edit').click()
    await page.getByTestId('tr-event-date').fill(today)
    await page.getByTestId('tr-save').click()
    await expect(page.getByTestId('tr-row').locator('.tr-cell-mark')).toBeVisible()

    database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const linked = database
      .prepare('SELECT key_event_date FROM transaction_record')
      .get() as { key_event_date: string }
    database.close()
    expect(linked.key_event_date).toBe(today)

    // ---- 同步到另一个账本 ----
    await createLedger(page, '乙账本')
    await page.getByTestId('ledger-trigger').click()
    await page
      .getByTestId('ledger-menu-row')
      .filter({ hasText: '甲账本' })
      .locator('.ledger-menu-name')
      .click()
    await expect(page.getByTestId('ledger-trigger')).toContainText('甲账本')

    await page.getByTestId('tr-sync').click()
    await page.getByRole('menuitem', { name: '乙账本' }).click()
    await expect(page.getByTestId('toast').first()).toContainText('同步成功')

    database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const ledgers = database.prepare('SELECT id, name FROM ledger').all() as Array<{
      id: string
      name: string
    }>
    const byLedger = database
      .prepare('SELECT ledger_id, amount_cents FROM transaction_record')
      .all() as Array<{ ledger_id: string; amount_cents: number }>
    database.close()
    const firstId = ledgers.find((ledger) => ledger.name === '甲账本')?.id
    const secondId = ledgers.find((ledger) => ledger.name === '乙账本')?.id
    expect(byLedger).toHaveLength(2)
    expect(byLedger.find((row) => row.ledger_id === firstId)?.amount_cents).toBe(2000)
    expect(byLedger.find((row) => row.ledger_id === secondId)?.amount_cents).toBe(2000)

    // ---- 删除（气泡确认） ----
    await page.getByTestId('tr-delete').click()
    await page.locator('.ant-popconfirm-buttons button').click()
    await expect(page.getByTestId('tr-empty')).toContainText('还没有记录')

    database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const remaining = database
      .prepare('SELECT ledger_id FROM transaction_record')
      .all() as Array<{ ledger_id: string }>
    database.close()
    expect(remaining).toHaveLength(1)
    expect(remaining[0]?.ledger_id).toBe(secondId)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
