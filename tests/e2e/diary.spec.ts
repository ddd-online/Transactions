import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test } from '@playwright/test'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

test('日记：保存/字数/覆盖/删除', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-diary-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.transactions-dev.json'),
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
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('ledger-name').fill('日记账本')
    await page.getByTestId('ledger-create').click()
    await expect(page.getByTestId('ledger-item')).toHaveText(/日记账本/)
    await page.getByTestId('nav-diary').click()

    await page.getByTestId('diary-date').fill('2026-01-15')
    await page.getByTestId('diary-mood').fill('平静')
    await page.getByTestId('diary-content').fill('今天很好')
    await page.getByTestId('diary-save').click()
    await expect(page.getByTestId('diary-word-count')).toHaveText('4 字')
    await expect(page.getByTestId('diary-date-item')).toHaveText(/2026-01-15/)

    await page.getByTestId('diary-content').fill('今天很好，明天继续')
    await page.getByTestId('diary-save').click()
    await expect(page.getByTestId('diary-word-count')).toHaveText('9 字')

    const exportDir = join(root, 'out')
    const importDir = join(root, 'in')
    mkdirSync(exportDir, { recursive: true })
    mkdirSync(importDir, { recursive: true })
    writeFileSync(join(importDir, '2026-02-01.txt'), '导入的日记', 'utf8')

    await page.getByTestId('diary-dir').fill(exportDir)
    await page.getByTestId('diary-export').click()
    await expect(page.getByTestId('diary-transfer-status')).toHaveText('导出 1/1 篇')
    expect(readFileSync(join(exportDir, '2026-01-15.txt'), 'utf8')).toBe('今天很好，明天继续')

    await page.getByTestId('diary-dir').fill(importDir)
    await page.getByTestId('diary-import').click()
    await expect(page.getByTestId('diary-transfer-status')).toHaveText('导入 1/1 篇')
    await expect(page.getByTestId('diary-date-item').filter({ hasText: '2026-02-01' })).toHaveCount(1)
    await page.getByTestId('diary-date-item').filter({ hasText: '2026-02-01' }).click()
    await page.getByTestId('diary-delete').click()
    await expect(page.getByTestId('diary-date-item').filter({ hasText: '2026-02-01' })).toHaveCount(0)
    await page.getByTestId('diary-date-item').filter({ hasText: '2026-01-15' }).click()

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const rows = database
      .prepare('SELECT date, content, mood, word_count FROM diary_entry ORDER BY date')
      .all() as Array<{ date: string; content: string; mood: string; word_count: number }>
    database.close()
    expect(rows).toEqual([
      { date: '2026-01-15', content: '今天很好，明天继续', mood: '平静', word_count: 9 },
    ])

    await page.getByTestId('diary-delete').click()
    await expect(page.getByTestId('diary-date-item')).toHaveCount(0)

    const after = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const count = after.prepare('SELECT COUNT(*) AS count FROM diary_entry').get() as {
      count: number
    }
    after.close()
    expect(count.count).toBe(0)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})




