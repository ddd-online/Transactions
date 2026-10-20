import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

function listen(server: Server): Promise<number> {
  return new Promise((resolveListening, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') reject(new Error('无法获取端口'))
      else resolveListening(address.port)
    })
  })
}

test('更新：慢速下载可取消并回到可下载状态', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-update-cancel-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.transactions-dev.json'),
    JSON.stringify({
      width: 1400,
      height: 1000,
      closeBehavior: 'quit',
      appearance: 'light',
      proxy: { mode: 'off', url: '' },
    }),
  )

  const server = createServer((request, response) => {
    if (request.url === '/release') {
      const port = (server.address() as { port: number }).port
      response.setHeader('content-type', 'application/json')
      response.end(
        JSON.stringify({
          tag_name: 'v9.9.9',
          assets: [
            {
              name: 'Transactions-9.9.9-setup.exe',
              browser_download_url: `http://127.0.0.1:${port}/slow.exe`,
              digest: '',
            },
          ],
        }),
      )
      return
    }
    if (request.url === '/slow.exe') {
      response.writeHead(200, { 'content-type': 'application/octet-stream' })
      const timer = setInterval(() => {
        response.write(Buffer.alloc(64 * 1024))
      }, 30)
      request.on('close', () => clearInterval(timer))
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
      TRANSACTIONS_TEST_UPDATE_DIR: join(root, 'update'),
    }),
  })

  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')
    await page.getByTestId('nav-settings').click()
    await page.getByTestId('update-check').click()
    await expect(page.getByTestId('update-status')).toContainText('9.9.9')
    await page.getByTestId('update-download').click()
    await expect(page.getByTestId('update-cancel')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('update-cancel').click()
    await expect(page.getByTestId('update-status')).toContainText('发现新版本', { timeout: 10_000 })
    await expect(page.getByTestId('update-download')).toBeVisible()
  } finally {
    await electronApp.close()
    await new Promise<void>((resolveClose) => server.close(() => resolveClose()))
    rmSync(root, { recursive: true, force: true })
  }
})
