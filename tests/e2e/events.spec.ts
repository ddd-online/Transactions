import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test } from '@playwright/test'

const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

test('事件：保存正文、上传图片、删除事件清理图片', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-events-'))
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
    await page.getByTestId('ledger-name').fill('事件账本')
    await page.getByTestId('ledger-create').click()
    await expect(page.getByTestId('ledger-item')).toHaveText(/事件账本/)
    await page.getByTestId('nav-events').click()

    await page.getByTestId('event-date').fill('2026-01-15')
    await page.getByTestId('event-title').fill('年会')
    await page.getByTestId('event-content').fill('抽奖与聚餐')
    await page.getByTestId('event-color').fill('red')
    await page.getByTestId('event-save').click()
    await expect(page.getByTestId('event-date-item')).toContainText('2026-01-15')

    await page.getByTestId('event-image-input').setInputFiles({
      name: 'demo.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    })
    await expect(page.getByTestId('image-crop')).toBeVisible()
    await page.getByTestId('image-crop-confirm').click()
    await expect(page.getByTestId('event-image')).toHaveCount(1)

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const event = database
      .prepare('SELECT title, content, color FROM key_event')
      .get() as { title: string; content: string; color: string }
    const image = database
      .prepare('SELECT file_path, thumb_path FROM key_event_image')
      .get() as { file_path: string; thumb_path: string }
    database.close()

    expect(event).toEqual({ title: '年会', content: '抽奖与聚餐', color: 'red' })
    expect(image.file_path).toMatch(/^key_events\/2026-01-15\/.+\.(png|jpg)$/)
    expect(image.thumb_path).toMatch(/^key_events\/2026-01-15\/thumb_.+\.jpg$/)
    expect(existsSync(join(workspace, 'data', 'assets', image.file_path))).toBe(true)
    expect(existsSync(join(workspace, 'data', 'assets', image.thumb_path))).toBe(true)

    await page.getByTestId('event-delete').click()
    await expect(page.getByTestId('event-date-item')).toHaveCount(0)
    await expect(page.getByTestId('event-image')).toHaveCount(0)

    const after = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const counts = after
      .prepare(
        'SELECT (SELECT COUNT(*) FROM key_event) AS events, (SELECT COUNT(*) FROM key_event_image) AS images',
      )
      .get() as { events: number; images: number }
    after.close()
    expect(counts).toEqual({ events: 0, images: 0 })
    expect(existsSync(join(workspace, 'data', 'assets', image.file_path))).toBe(false)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})


