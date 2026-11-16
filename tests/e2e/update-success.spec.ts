import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'
import { environment, listen } from './helpers'

test('更新：检查到新版本、下载并校验 SHA256', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-update-ok-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  const updateDir = join(root, 'update')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  mkdirSync(updateDir, { recursive: true })
  writeFileSync(
    join(home, '.tr.dev.json'),
    JSON.stringify({
      width: 1400,
      height: 1000,
      closeBehavior: 'quit',
      appearance: 'light',
      proxy: { mode: 'off', url: '' },
    }),
  )

  const installer = Buffer.from('fake installer bytes for updater smoke')
  const digest = createHash('sha256').update(installer).digest('hex')
  const server = createServer((request, response) => {
    if (request.url === '/release') {
      const port = (server.address() as { port: number }).port
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          tag_name: 'v9.9.9',
          body: `## 测试更新

- 第一项
- 第二项

**重要**：测试 Markdown。`,
          assets: [
            {
              name: 'Transactions-9.9.9-setup.exe',
              browser_download_url: `http://127.0.0.1:${port}/Transactions-9.9.9-setup.exe`,
              digest: `sha256:${digest}`,
            },
          ],
        }),
      )
      return
    }
    if (request.url === '/Transactions-9.9.9-setup.exe') {
      response.setHeader('content-type', 'application/octet-stream')
      response.end(installer)
      return
    }
    response.statusCode = 404
    response.end('not found')
  })
  const port = await listen(server)

  const electronApp = await electron.launch({
    args: ['.'],
    cwd: repositoryRoot,
    env: environment({
      USERPROFILE: home,
      HOME: home,
      TRANSACTIONS_USER_DATA: userData,
      TRANSACTIONS_TEST_DIALOG_DIR: workspace,
      TRANSACTIONS_TEST_CLOSE: 'quit',
      TRANSACTIONS_TEST_RELEASE_API: `http://127.0.0.1:${port}/release`,
      TRANSACTIONS_TEST_UPDATE_LOCAL: '1',
      TRANSACTIONS_TEST_UPDATE_DIR: updateDir,
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('settings-tab-about').click()
    await page.getByTestId('update-check').click()
    await expect(page.getByTestId('update-status')).toContainText('9.9.9')
    const notes = page.getByTestId('update-release-body')
    await expect(notes.locator('h2')).toHaveText('测试更新')
    await expect(notes.locator('li')).toHaveCount(2)
    await expect(notes.locator('strong')).toHaveText('重要')
    // 按钮行与说明卡片之间要有间隔：`.st-about-update` 是不带 gap 的纵向 flex，
    // 少了这条间距说明会直接贴住「下载更新」那一行（曾经如此）。
    const rowBox = await page.locator('.st-update-row').first().boundingBox()
    const notesBox = await notes.boundingBox()
    expect(notesBox!.y - (rowBox!.y + rowBox!.height)).toBeGreaterThanOrEqual(8)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'update-markdown.png'),
    })
    await page.getByTestId('update-download').click()
    await expect(page.getByTestId('update-status')).toContainText('下载完成', { timeout: 20_000 })
    const downloaded = join(updateDir, 'Transactions-9.9.9-setup.exe')
    expect(existsSync(downloaded)).toBe(true)
    expect(statSync(downloaded).size).toBe(installer.length)
  } finally {
    await electronApp.close()
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
    rmSync(root, { recursive: true, force: true })
  }
})

