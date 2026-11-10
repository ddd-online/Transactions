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

test('待办历史：默认每页 15 条，可切换条数', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-todo-history-page-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({ width: 1400, height: 1000, closeBehavior: 'quit', appearance: 'light' }),
  )

  const app = await electron.launch({
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
    const page = await app.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '待办账本')

    // 直接补 21 条已完成事项：走界面要连开 21 次表单，慢且杂音大；这里只关心分页口径。
    // 完成时刻递增，历史按完成时刻倒序，所以第 1 页第一行是最后完成的「事项 20」。
    const database = new DatabaseSync(join(workspace, 'transactions.db'))
    const ledgerRow = database
      .prepare('SELECT id FROM ledger ORDER BY created_at ASC LIMIT 1')
      .get() as { id: string }
    database
      .prepare(
        'INSERT INTO todo_card (id, ledger_id, title, created_at, updated_at, sort_order) ' +
          'VALUES (?, ?, ?, ?, ?, ?)',
      )
      .run('card-seed', ledgerRow.id, '工作', 1_760_000_000, 1_760_000_000, 1)
    const insertItem = database.prepare(
      'INSERT INTO todo_item ' +
        '(id, ledger_id, card_id, title, start_date, due_date, urgency, importance, status, ' +
        'completed_at, created_at, updated_at) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    )
    for (let index = 0; index < 21; index += 1) {
      insertItem.run(
        `item-seed-${index}`,
        ledgerRow.id,
        'card-seed',
        `事项 ${index}`,
        '',
        '',
        1,
        1,
        'done',
        1_760_000_000 + index,
        1_760_000_000 + index,
        1_760_000_000 + index,
      )
    }
    database.close()

    await page.reload()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-todo').click()
    await page.getByTestId('todo-tab-history').click()

    const rows = page.getByTestId('todo-history-item')
    const foot = page.getByTestId('todo-history-foot')
    await expect(rows).toHaveCount(15)
    await expect(foot).toContainText('共 21 条')
    // 分页条默认就是每页 15 条
    await expect(foot).toContainText('15 条/页')
    // 分页跟着表格走：在表格下方、同一个滚动区里
    await expect(page.locator('.todo-scroll .tr-table-foot')).toContainText('共 21 条')
    // 完成时刻倒序：最新完成的排在第一行
    await expect(rows.nth(0)).toContainText('事项 20')
    await expect(rows.nth(14)).toContainText('事项 6')
    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'todo-history-page1.png'),
    })

    await foot.locator('.ant-pagination-item-2').click()
    await expect(rows).toHaveCount(6)
    await expect(rows.nth(0)).toContainText('事项 5')
    await expect(rows.nth(5)).toContainText('事项 0')
    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'todo-history-page2.png'),
    })

    // 换成每页 30 条：回到第一页，21 条一页装下
    await foot.locator('.ant-pagination-options .ant-select').click()
    await page.locator('.ant-select-item-option', { hasText: '30 条/页' }).click()
    await expect(rows).toHaveCount(21)
    await expect(foot).toContainText('30 条/页')
    await expect(foot.locator('.ant-pagination-item-2')).toHaveCount(0)

    // 换成每页 20 条：同样回第一页，两页装下
    await foot.locator('.ant-pagination-options .ant-select').click()
    await page.locator('.ant-select-item-option', { hasText: '20 条/页' }).click()
    await expect(rows).toHaveCount(20)
    await expect(foot).toContainText('20 条/页')
    await foot.locator('.ant-pagination-item-2').click()
    await expect(rows).toHaveCount(1)
    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'todo-history-page2-size20.png'),
    })

    // 删掉末页唯一的这条：总页数缩回一页，按总页数夹一下，不停在一张空表上
    await page.getByTestId('todo-history-delete').click()
    await page.locator('.ant-popconfirm-buttons button').last().click()
    await expect(rows).toHaveCount(20)
    await expect(foot).toContainText('共 20 条')
    await expect(foot.locator('.ant-pagination-item-active')).toHaveText('1')
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
