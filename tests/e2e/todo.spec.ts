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

test('待办：主题 → 事项 → 进度 → 完成进入历史', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-todo-'))
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
    await createLedger(page, '待办账本')
    await page.getByTestId('nav-todo').click()

    await page.getByTestId('todo-card-open').click()
    await expect(page.getByRole('dialog', { name: '新建主题' })).toBeVisible()
    await page.getByTestId('todo-card-create').click()
    await expect(page.getByTestId('todo-card-error')).toContainText('请输入主题名称')
    await page.getByTestId('todo-card-title').fill('工作')
    await page.getByTestId('todo-card-create').click()
    await expect(page.getByTestId('todo-card')).toContainText('工作')

    await page.getByTestId('todo-card').hover()
    await page.getByTestId('todo-item-add').click()
    await expect(page.getByRole('dialog', { name: '添加事项' })).toBeVisible()
    // 六档默认「次低」，表单补齐起止时间与两档评估
    await expect(page.getByTestId('todo-item-urgency')).toContainText('次低')
    await expect(page.getByTestId('todo-item-importance')).toContainText('次低')
    await page.getByTestId('todo-item-title').fill('写周报')
    await page.getByTestId('todo-item-start').fill('2026-01-05')
    await page.getByTestId('todo-item-start').press('Enter')
    await page.getByTestId('todo-item-due').fill('2026-01-09')
    await page.getByTestId('todo-item-due').press('Enter')
    await page.getByTestId('todo-item-urgency').click()
    await page
      .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      .last()
      .click()
    await page.getByTestId('todo-item-importance').click()
    await page
      .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      .last()
      .click()
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'todo-item-form.png'),
    })
    await page.getByTestId('todo-item-create').click()
    await expect(page.getByTestId('todo-item')).toContainText('写周报')
    await expect(page.getByTestId('todo-item')).toContainText('紧急 高')
    await expect(page.getByTestId('todo-item')).toContainText('重要 高')
    await expect(page.getByTestId('todo-item')).toContainText('2026-01-05 → 2026-01-09')

    // 编辑事项：复用同一张表单，预填后改截止日期
    await page.getByTestId('todo-item').hover()
    await page.getByTestId('todo-item-edit').click()
    await expect(page.getByRole('dialog', { name: '编辑事项' })).toBeVisible()
    await expect(page.getByTestId('todo-item-title')).toHaveValue('写周报')
    await expect(page.getByTestId('todo-item-start')).toHaveValue('2026-01-05')
    await page.getByTestId('todo-item-due').fill('2026-01-10')
    await page.getByTestId('todo-item-due').press('Enter')
    await page.getByTestId('todo-item-create').click()
    await expect(page.getByTestId('todo-item')).toContainText('2026-01-05 → 2026-01-10')
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'todo-board-item.png'),
    })

    // 四象限：点落在「马上做」，点象限名能打开该格清单
    await page.getByTestId('todo-view-quadrant').click()
    await expect(page.getByTestId('todo-quadrant')).toBeVisible()
    await expect(page.locator('.todo-quadrant__point')).toHaveCount(1)
    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'todo-quadrant.png'),
    })
    await page.locator('.todo-quadrant__name').filter({ hasText: '马上做' }).click()
    await expect(page.getByRole('dialog')).toContainText('马上做 · 重要且紧急')
    await expect(page.getByTestId('todo-quadrant-row')).toContainText('写周报')
    await expect(page.getByTestId('todo-quadrant-row')).toContainText('工作')
    await expect(page.getByTestId('todo-quadrant-row')).toContainText('紧急 高')
    await expect(page.getByTestId('todo-quadrant-row')).toContainText('重要 高')
    await expect(page.getByTestId('todo-quadrant-row')).toContainText('2026-01-05 → 2026-01-10')
    await page.keyboard.press('Escape')
    await page.getByTestId('todo-view-board').click()

    await page.getByTestId('todo-item-toggle').click()
    await page.getByTestId('todo-progress-input').fill('完成一半')
    await page.getByTestId('todo-progress-add').click()
    await expect(page.getByTestId('todo-item')).toContainText('完成一半')

    await page.getByTestId('todo-progress-done').click()
    await expect(page.getByTestId('todo-progress-done')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('todo-item-done').click()
    await page.getByTestId('todo-tab-history').click()
    await expect(page.getByTestId('todo-history-item')).toContainText('写周报')
    await expect(page.getByTestId('todo-history-item')).toContainText('工作')
    await expect(page.getByTestId('todo-item')).toHaveCount(0)

    // 历史里的进度数字可点开查看记录（只读弹层，不提供勾选/删除）
    await page.getByTestId('todo-history-progress').click()
    const progressModal = page.getByTestId('todo-history-progress-modal')
    await expect(progressModal).toBeVisible()
    await expect(progressModal).toContainText('工作')
    await expect(progressModal).toContainText('写周报')
    await expect(page.getByTestId('todo-history-progress-row')).toHaveCount(1)
    await expect(page.getByTestId('todo-history-progress-row')).toContainText('完成一半')
    await expect(page.getByTestId('todo-history-progress-row')).toHaveClass(/is-done/)
    await page.waitForTimeout(600)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'todo-history-progress.png'),
    })
    await page.keyboard.press('Escape')
    await expect(progressModal).toBeHidden()

    // 历史里的删除也是文本按钮，点开二次确认
    await page.getByTestId('todo-history-delete').click()
    await expect(page.getByText('删除事项「写周报」？')).toBeVisible()
    await page.locator('.ant-popconfirm-buttons button').first().click()

    // 「回到待办」把事项从历史放回卡片，再完成一次
    await page.getByTestId('todo-history-reopen').click()
    await expect(page.getByTestId('todo-history-item')).toHaveCount(0)
    await page.getByTestId('todo-tab-cards').click()
    await expect(page.getByTestId('todo-item')).toContainText('写周报')
    await page.getByTestId('todo-item-done').click()
    await page.getByTestId('todo-tab-history').click()
    await expect(page.getByTestId('todo-history-item')).toHaveCount(1)

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const item = database
      .prepare(
        'SELECT title, status, completed_at, start_date, due_date, urgency, importance FROM todo_item',
      )
      .get() as {
      title: string
      status: string
      completed_at: number
      start_date: string
      due_date: string
      urgency: number
      importance: number
    }
    const progress = database
      .prepare('SELECT content, done FROM todo_progress')
      .get() as { content: string; done: number }
    database.close()
    expect(item).toEqual({
      title: '写周报',
      status: 'done',
      completed_at: expect.any(Number),
      start_date: '2026-01-05',
      due_date: '2026-01-10',
      urgency: 5,
      importance: 5,
    })
    expect(item.completed_at).toBeGreaterThan(0)
    expect(progress).toEqual({ content: '完成一半', done: 1 })
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})




