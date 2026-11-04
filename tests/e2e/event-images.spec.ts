import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test } from '@playwright/test'

import { createLedger } from './ledger-helper'

const HEIC_STILL = readFileSync(resolve(__dirname, '../../fixtures/heic/gradient-512.heic'))
const MOTION = readFileSync(resolve(__dirname, '../../fixtures/media/live-motion.mp4'))

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

interface ImageRow {
  file_path: string
  thumb_path: string
  original_path: string
  motion_path: string
}

test('事件图片：HEIC 转码入库，实况连播放', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-event-media-'))
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

  const assets = (path: string): string => join(workspace, 'data', 'assets', path)

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '事件账本')
    await page.getByTestId('nav-events').click()

    const eventDate = `${new Date().getFullYear()}-01-15`
    await page.getByTestId('event-add').click()
    await page.getByTestId('event-add-date').fill(eventDate)
    await page.getByTestId('event-add-title').fill('实况')
    await page.getByTestId('event-add-confirm').click()
    await expect(page.getByTestId('event-date-item')).toContainText('实况')

    // 1) 单张 HEIC：Chromium 解不了，主进程转码成 JPEG，原图留在工作空间里
    await page.getByTestId('event-image-input').setInputFiles({
      name: 'IMG_0001.HEIC',
      mimeType: 'image/heic',
      buffer: HEIC_STILL,
    })
    await expect(page.getByTestId('event-image')).toHaveCount(1, { timeout: 20_000 })
    await expect(page.getByTestId('event-gallery-empty')).toHaveCount(0)

    // 展示图是 JPEG，主图真的渲染出来了（不是破图）
    const mainImage = page.getByTestId('event-image-main').locator('img')
    await expect(mainImage).toHaveAttribute('src', /\.jpg$/)
    await expect
      .poll(() => mainImage.evaluate((element) => (element as HTMLImageElement).naturalWidth))
      .toBe(512)
    // 缩略图按 300 宽下采样
    await expect
      .poll(() =>
        page.getByTestId('event-image').first().evaluate((element) => (element as HTMLImageElement).naturalWidth),
      )
      .toBe(300)

    // 2) 实况：同名照片 + 视频一起选，动态部分存成独立文件
    await page.getByTestId('event-image-input').setInputFiles([
      { name: 'IMG_0002.HEIC', mimeType: 'image/heic', buffer: HEIC_STILL },
      { name: 'IMG_0002.mp4', mimeType: 'video/mp4', buffer: MOTION },
    ])
    await expect(page.getByTestId('event-image')).toHaveCount(2, { timeout: 20_000 })
    await page.getByTestId('event-image').nth(1).click()

    const live = page.getByTestId('event-live')
    await expect(live).toBeVisible()
    await expect(live).toHaveAttribute('data-playing', 'false')
    // 缩略图上的实况角标只出现在有动态的那张上
    await expect(page.getByTestId('event-image-live')).toHaveCount(1)

    // 缩略图本身是按钮：键盘 Tab 得到、Enter 能切，选中态由 aria-pressed 表达（不再只写在类上）
    const thumbs = page.getByTestId('event-image-select')
    await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'true')
    await thumbs.nth(0).focus()
    await page.keyboard.press('Enter')
    await expect(thumbs.nth(0)).toHaveAttribute('aria-pressed', 'true')
    await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'false')
    // 切回实况那张，后面的播放断言继续落在它身上
    await thumbs.nth(1).click()
    await expect(thumbs.nth(1)).toHaveAttribute('aria-pressed', 'true')

    // 点「实况」开始播放
    await page.getByTestId('event-live-toggle').click()
    await expect(live).toHaveAttribute('data-playing', 'true')
    const video = page.locator('.key-event-live__video')
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).currentTime)).toBeGreaterThan(0.2)
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(false)
    await page.screenshot({ path: join(repositoryRoot, 'artifacts', 'tests', 'events-live.png') })

    // 再点一次回到静态照片
    await page.getByTestId('event-live-toggle').click()
    await expect(live).toHaveAttribute('data-playing', 'false')
    await expect.poll(() => video.evaluate((element) => (element as HTMLVideoElement).paused)).toBe(true)

    // 播完自动回到照片
    await page.getByTestId('event-live-toggle').click()
    await expect(live).toHaveAttribute('data-playing', 'false', { timeout: 10_000 })

    // 大图预览里也能播
    await page.getByTestId('event-image-main').click()
    await expect(page.locator('.ant-image-preview')).toBeVisible()
    await page.getByTestId('event-live-preview-toggle').click()
    await expect(page.getByTestId('event-live-preview')).toHaveAttribute('data-playing', 'true')
    await page.keyboard.press('Escape')
    await expect(page.locator('.ant-image-preview')).toBeHidden()

    // 3) 只选视频时明说，不猜
    await page.getByTestId('event-image-input').setInputFiles({
      name: 'IMG_0003.MOV',
      mimeType: 'video/quicktime',
      buffer: MOTION,
    })
    await expect(page.getByTestId('event-error')).toContainText('实况视频要和同名的照片一起选')
    await expect(page.getByTestId('event-image')).toHaveCount(2)

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const rows = database
      .prepare('SELECT file_path, thumb_path, original_path, motion_path FROM key_event_image ORDER BY sort_order')
      .all() as unknown as ImageRow[]
    database.close()

    expect(rows).toHaveLength(2)
    const [still, liveRow] = rows
    expect(still.file_path).toMatch(/^key_events\/[^/]+\/.+\.jpg$/)
    expect(still.original_path).toMatch(/\.heic$/)
    expect(still.motion_path).toBe('')
    expect(liveRow.motion_path).toMatch(/\.mp4$/)
    expect(liveRow.original_path).toMatch(/\.heic$/)

    for (const row of rows) {
      for (const path of [row.file_path, row.thumb_path, row.original_path, row.motion_path].filter(Boolean)) {
        expect(existsSync(assets(path))).toBe(true)
      }
      // 展示图与缩略图都是真 JPEG
      expect(readFileSync(assets(row.file_path)).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
      expect(readFileSync(assets(row.thumb_path)).subarray(0, 3)).toEqual(Buffer.from([0xff, 0xd8, 0xff]))
      // 原图按字节原样保留
      expect(readFileSync(assets(row.original_path))).toEqual(HEIC_STILL)
    }
    expect(readFileSync(assets(liveRow.motion_path))).toEqual(MOTION)

    // 4) 删事件时四类文件一起清掉
    await page.getByTestId('event-date-item').getByTestId('event-delete').click()
    await page.locator('.ant-popconfirm-buttons button:last-child').click()
    await expect(page.getByTestId('event-image')).toHaveCount(0)
    for (const row of rows) {
      for (const path of [row.file_path, row.thumb_path, row.original_path, row.motion_path].filter(Boolean)) {
        expect(existsSync(assets(path))).toBe(false)
      }
    }
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
