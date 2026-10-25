import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test } from '@playwright/test'

import { createLedger } from './ledger-helper'

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
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '事件账本')
    await page.getByTestId('nav-events').click()
    const currentYear = String(new Date().getFullYear())
    const eventDate = `${currentYear}-01-15`
    await expect(page.getByTestId('event-year-trigger')).toHaveText(currentYear)
    await expect(page.getByText('选择左侧事件查看详情')).toBeVisible()
    await expect(page.getByText('选择事件查看关联交易')).toBeVisible()

    await page.getByRole('button', { name: '上一年' }).click()
    await expect(page.getByTestId('event-year-trigger')).toHaveText(String(Number(currentYear) - 1))
    await page.getByRole('button', { name: '下一年' }).click()
    await expect(page.getByTestId('event-year-trigger')).toHaveText(currentYear)

    await page.getByTestId('event-year-trigger').click()
    await page.getByTestId(`event-year-year-${Number(currentYear) - 1}`).click()
    await expect(page.getByTestId('event-year-trigger')).toHaveText(String(Number(currentYear) - 1))
    await page.getByTestId('event-year-trigger').click()
    await page.getByTestId(`event-year-year-${currentYear}`).click()
    await expect(page.getByTestId('event-year-trigger')).toHaveText(currentYear)

    await page.getByTestId('event-add').click()
    await expect(page.getByRole('dialog', { name: '新增事件' })).toBeVisible()
    await page.getByTestId('event-add-date').fill(eventDate)
    await page.getByTestId('event-add-title').fill('年会')
    await page.getByTestId('event-add-confirm').click()
    await expect(page.getByTestId('event-date-item')).toContainText('年会')
    await expect(page.getByTestId('event-date-item')).toContainText('01-15')

    await page.getByTestId('event-color-0').click()
    await page.getByTestId('event-edit-content').click()
    await page.getByTestId('event-content').fill('抽奖与聚餐')
    await page.getByTestId('event-save').click()
    await expect(page.getByTestId('event-content-view')).toContainText('抽奖与聚餐')
    await page.waitForTimeout(400)
    await page.screenshot({ path: join(repositoryRoot, 'artifacts', 'tests', 'events.png') })

    await page.getByTestId('event-links-toggle').click()
    await expect(page.getByTestId('event-links-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect
      .poll(() => JSON.parse(readFileSync(join(home, '.tr.dev.json'), 'utf8')).keyEventLinkedOpen)
      .toBe(false)
    await page.getByTestId('event-links-toggle').click()
    await expect(page.getByTestId('event-links-toggle')).toHaveAttribute('aria-expanded', 'true')
    await expect
      .poll(() => JSON.parse(readFileSync(join(home, '.tr.dev.json'), 'utf8')).keyEventLinkedOpen)
      .toBe(true)

    await page.getByTestId('event-image-input').setInputFiles({
      name: 'demo.png',
      mimeType: 'image/png',
      buffer: PNG_1X1,
    })
    // 原图直接上传：不再经过裁剪弹窗
    await expect(page.getByTestId('event-image')).toHaveCount(1)

    // 大图点开 AntD 预览（可缩放/切换），整图后面垫一层同图虚化底；Esc 关闭
    await page.getByTestId('event-image-main').click()
    await expect(page.locator('.ant-image-preview')).toBeVisible()
    const previewBlur = page.locator('.key-event-preview-blur')
    await expect(previewBlur).toBeVisible()
    await expect(previewBlur).toHaveCSS('filter', /blur\(48px\)/)
    await expect(previewBlur).toHaveAttribute('style', /trasset:\/\/local\//)
    // 虚化底必须比视口四周各宽出一截：blur 会把边缘外的透明羽化进来，
    // 羽化带落在视口里就会透出背后的界面。等预览的缩放入场动画跑完再量。
    await expect
      .poll(async () => previewBlur.evaluate((element) => element.getBoundingClientRect().width))
      .toBeGreaterThan(1500)
    const bleed = await previewBlur.evaluate((element) => {
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        top: rect.top,
        right: window.innerWidth - rect.right,
        bottom: window.innerHeight - rect.bottom,
      }
    })
    expect(bleed.left).toBeLessThanOrEqual(-100)
    expect(bleed.top).toBeLessThanOrEqual(-100)
    expect(bleed.right).toBeLessThanOrEqual(-100)
    expect(bleed.bottom).toBeLessThanOrEqual(-100)
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'events-preview.png'),
    })
    await page.keyboard.press('Escape')
    await expect(page.locator('.ant-image-preview')).toBeHidden()

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const event = database
      .prepare('SELECT title, content, color FROM key_event')
      .get() as { title: string; content: string; color: string }
    const image = database
      .prepare('SELECT file_path, thumb_path FROM key_event_image')
      .get() as { file_path: string; thumb_path: string }
    database.close()

    expect(event).toEqual({ title: '年会', content: '抽奖与聚餐', color: '#D9705A' })
    expect(image.file_path).toMatch(new RegExp(`^key_events/${eventDate}/.+\\.(png|jpg)$`))
    expect(image.thumb_path).toMatch(new RegExp(`^key_events/${eventDate}/thumb_.+\\.jpg$`))
    expect(existsSync(join(workspace, 'data', 'assets', image.file_path))).toBe(true)
    expect(existsSync(join(workspace, 'data', 'assets', image.thumb_path))).toBe(true)

    await page.getByTestId('event-date-item').getByTestId('event-delete').click()
    await expect(page.getByText('删除事件「年会」？')).toBeVisible()
    await page.locator('.ant-popconfirm-buttons button:last-child').click()
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









