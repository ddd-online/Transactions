import { spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
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

test('单实例：第二个进程立即退出', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-single-'))
  const home = join(root, 'home')
  const workspace = join(root, 'ws')
  const userData = join(root, 'user-data')
  mkdirSync(home, { recursive: true })
  mkdirSync(userData, { recursive: true })
  writeFileSync(
    join(home, '.tr-dev.json'),
    JSON.stringify({ width: 1200, height: 800, closeBehavior: 'quit', appearance: 'light' }),
  )

  const env = environment({
    USERPROFILE: home,
    HOME: home,
    TRANSACTIONS_USER_DATA: userData,
    TRANSACTIONS_TEST_DIALOG_DIR: workspace,
    TRANSACTIONS_TEST_CLOSE: 'quit',
  })

  const electronApp = await electron.launch({ args: ['.'], cwd: repositoryRoot, env })
  try {
    const page = await electronApp.firstWindow()
    await page.getByTestId('open-workspace').click()
    await expect(page.getByTestId('workspace-state')).toContainText('已打开')

    const electronPath = require('electron') as unknown as string
    const child = spawn(electronPath, ['.'], { cwd: repositoryRoot, env, stdio: 'ignore' })
    const exitCode = await new Promise<number | null>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('第二个实例未在 10s 内退出')), 10_000)
      child.on('exit', (code) => {
        clearTimeout(timer)
        resolve(code)
      })
      child.on('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
    })
    expect(exitCode).toBe(0)
    expect(page.isClosed()).toBe(false)
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})
