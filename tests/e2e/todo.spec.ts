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
    // 日期字段的名字来自 aria-label（可见标签只是旁边的 span）
    await expect(page.getByLabel('开始时间')).toBeVisible()
    // 六档默认「次低」，表单补齐起止时间与两档评估
    await expect(page.getByTestId('todo-item-urgency')).toContainText('次低')
    await expect(page.getByTestId('todo-item-importance')).toContainText('次低')

    // 日历里的中文不止 antd 的文案：月份缩写与星期那一行来自 dayjs 的 zh-cn
    // （DESIGN.md「DatePicker / Select」）。少了那份数据，这里是「2026年 Nov」与 Su/Mo/…
    await page.getByTestId('todo-item-start-toggle').click()
    const calendar = page.locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
    await expect(calendar.locator('.ant-picker-content th')).toHaveText([
      '一',
      '二',
      '三',
      '四',
      '五',
      '六',
      '日',
    ])
    await expect(calendar.locator('.ant-picker-month-btn')).toHaveText(/^\d+月$/)
    await calendar.locator('.ant-picker-month-btn').click()
    await expect(calendar.locator('.ant-picker-cell')).toHaveCount(12)
    await expect(calendar.locator('.ant-picker-cell').first()).toHaveText(/^1月$/)
    await calendar.locator('.ant-picker-cell').first().click()

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

    // 进度可以就地订正：行尾的铅笔把正文换成输入框，Enter 保存（勾选与记录时间不动）
    await page.getByTestId('todo-progress-row').hover()
    await page.getByTestId('todo-progress-edit').click()
    await expect(page.getByTestId('todo-progress-editor')).toHaveValue('完成一半')
    await page.getByTestId('todo-progress-editor').fill('完成一大半')
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'todo-progress-edit.png'),
    })
    await page.getByTestId('todo-progress-editor').press('Enter')
    await expect(page.getByTestId('todo-progress-editor')).toHaveCount(0)
    await expect(page.getByTestId('todo-item')).toContainText('完成一大半')
    // 焦点回到这一行的铅笔：不掉到 <body> 上，键盘用户下一步还在原处
    await expect(page.getByTestId('todo-progress-edit')).toBeFocused()

    // Esc 取消：库里留着上一次保存的正文
    await page.getByTestId('todo-progress-row').hover()
    await page.getByTestId('todo-progress-edit').click()
    await page.getByTestId('todo-progress-editor').fill('不要这条')
    await page.getByTestId('todo-progress-editor').press('Escape')
    await expect(page.getByTestId('todo-progress-editor')).toHaveCount(0)
    await expect(page.getByTestId('todo-item')).toContainText('完成一大半')
    await expect(page.getByTestId('todo-progress-edit')).toBeFocused()

    // 长文订正：框自己长高（单行输入只会滚到结尾），Enter 仍是保存
    const longNote = '把这一季度的流水按分类重新对了一遍，差异出在几笔跨月的退款上；'.repeat(10)
    await page.getByTestId('todo-progress-input').fill(longNote)
    await page.getByTestId('todo-progress-input').press('Enter')
    await expect(page.getByTestId('todo-progress-row')).toHaveCount(2)
    await page.getByTestId('todo-progress-row').last().hover()
    await page.getByTestId('todo-progress-row').last().getByTestId('todo-progress-edit').click()
    await expect(page.getByTestId('todo-progress-editor')).toHaveValue(longNote)
    const editorBox = await page.getByTestId('todo-progress-editor').boundingBox()
    if (!editorBox) throw new Error('没有量到进度输入框')
    expect(editorBox.height).toBeGreaterThan(60)
    await page.getByTestId('todo-progress-editor').press('Escape')
    // 订正用的长文删掉，后面的历史断言仍只有一条进度
    await page.getByTestId('todo-progress-row').last().hover()
    await page.getByTestId('todo-progress-row').last().getByTestId('todo-progress-delete').click()
    await page.locator('.ant-popconfirm-buttons button').last().click()
    await expect(page.getByTestId('todo-progress-row')).toHaveCount(1)

    // 进度记录缩进到事项标题的竖线上：和事项勾选框同列时，两块读起来是兄弟而不是父子
    const indent = await page.evaluate(() => {
      const left = (selector: string): number => {
        const element = document.querySelector(selector)
        return element ? element.getBoundingClientRect().left : -1
      }
      return {
        itemCheck: left('.todo-item__check'),
        itemTitle: left('.todo-item__title'),
        progressCheck: left('.todo-progress__check'),
      }
    })
    expect(indent.progressCheck).toBeCloseTo(indent.itemTitle, 0)
    expect(indent.progressCheck - indent.itemCheck).toBeGreaterThan(20)

    // 整条事项都是展开/收起的点击面：点标题、点行的内边距都能切换
    await page.locator('.todo-item__title').click()
    await expect(page.getByTestId('todo-progress-input')).toHaveCount(0)
    await page.locator('.todo-item__title').click()
    await expect(page.getByTestId('todo-progress-input')).toBeVisible()
    const itemRow = await page.locator('.todo-item__row').boundingBox()
    if (!itemRow) throw new Error('没有量到事项行')
    await page.mouse.click(itemRow.x + 8, itemRow.y + itemRow.height / 2)
    await expect(page.getByTestId('todo-progress-input')).toHaveCount(0)
    await page.mouse.click(itemRow.x + 8, itemRow.y + itemRow.height / 2)
    await expect(page.getByTestId('todo-progress-input')).toBeVisible()

    // 主题可收起：事项整块让位，段头与计数留着；再点一次铺回来
    await page.getByTestId('todo-card-toggle').click()
    await expect(page.getByTestId('todo-card-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(page.getByTestId('todo-card')).toContainText('工作')
    await expect(page.locator('.todo-items')).toBeHidden()
    await expect(page.getByTestId('todo-card')).toHaveClass(/is-collapsed/)
    await page.getByTestId('todo-card-toggle').click()
    await expect(page.locator('.todo-items')).toBeVisible()
    await expect(page.getByTestId('todo-card')).not.toHaveClass(/is-collapsed/)

    // 往收起的主题里加事项会先把它展开，新事项不会落在看不见的地方
    await page.getByTestId('todo-card-toggle').click()
    await page.getByTestId('todo-card').hover()
    await page.getByTestId('todo-item-add').click()
    await expect(page.getByRole('dialog', { name: '添加事项' })).toBeVisible()
    await expect(page.locator('.todo-items')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: '添加事项' })).toBeHidden()

    // 段头整条也能点：点在标题右侧的空白上同样收起，再点回来
    const head = await page.locator('.todo-group__head').boundingBox()
    if (!head) throw new Error('没有量到段头')
    await page.mouse.click(head.x + head.width / 2, head.y + head.height / 2)
    await expect(page.locator('.todo-items')).toBeHidden()
    await page.mouse.click(head.x + head.width / 2, head.y + head.height / 2)
    await expect(page.locator('.todo-items')).toBeVisible()

    // 工具栏的「全部展开 / 全部收起」是同一动作的批量版：没可做的就置灰
    await expect(page.getByTestId('todo-expand-all')).toBeDisabled()
    await page.getByTestId('todo-collapse-all').click()
    await expect(page.locator('.todo-items')).toBeHidden()
    await expect(page.getByTestId('todo-collapse-all')).toBeDisabled()
    await expect(page.getByTestId('todo-expand-all')).toBeEnabled()
    await page.getByTestId('todo-expand-all').click()
    await expect(page.locator('.todo-items')).toBeVisible()
    await expect(page.getByTestId('todo-expand-all')).toBeDisabled()
    await expect(page.getByTestId('todo-collapse-all')).toBeEnabled()

    await page.getByTestId('todo-progress-done').click()
    await expect(page.getByTestId('todo-progress-done')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('todo-item-done').click()
    await page.getByTestId('todo-tab-history').click()
    await expect(page.getByTestId('todo-history-item')).toContainText('写周报')
    await expect(page.getByTestId('todo-history-item')).toContainText('工作')
    await expect(page.getByTestId('todo-item')).toHaveCount(0)

    // 历史里的进度数字可点开查看记录（弹层里只订正正文，不提供勾选 / 删除）
    await page.getByTestId('todo-history-progress').click()
    const progressModal = page.getByTestId('todo-history-progress-modal')
    await expect(progressModal).toBeVisible()
    await expect(progressModal).toContainText('工作')
    await expect(progressModal).toContainText('写周报')
    await expect(page.getByTestId('todo-history-progress-row')).toHaveCount(1)
    await expect(page.getByTestId('todo-history-progress-row')).toContainText('完成一大半')
    await expect(page.getByTestId('todo-history-progress-row')).toHaveClass(/is-done/)
    // 弹层进场动画走完再悬停：动画中途落的鼠标位置会随弹层一起移开
    await page.waitForTimeout(600)

    // 弹层里也能订正：保存后这一行跟着变，勾选仍是记录原样
    await page.getByTestId('todo-history-progress-row').hover()
    await page.getByTestId('todo-history-progress-edit').click()
    await expect(page.getByTestId('todo-history-progress-editor')).toHaveValue('完成一大半')
    await page.getByTestId('todo-history-progress-editor').fill('完成一大半，剩收尾')
    await page.getByTestId('todo-history-progress-editor').press('Enter')
    await expect(page.getByTestId('todo-history-progress-editor')).toHaveCount(0)
    await expect(page.getByTestId('todo-history-progress-row')).toContainText(
      '完成一大半，剩收尾',
    )
    await expect(page.getByTestId('todo-history-progress-row')).toHaveClass(/is-done/)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'todo-history-progress.png'),
    })

    // Esc 只取消这次订正，不关弹层（也不把改了一半的字留下）
    await page.getByTestId('todo-history-progress-row').hover()
    await page.getByTestId('todo-history-progress-edit').click()
    await page.getByTestId('todo-history-progress-editor').fill('不要这条')
    await page.getByTestId('todo-history-progress-editor').press('Escape')
    await expect(page.getByTestId('todo-history-progress-editor')).toHaveCount(0)
    await expect(progressModal).toBeVisible()
    await expect(page.getByTestId('todo-history-progress-row')).toContainText(
      '完成一大半，剩收尾',
    )
    await page.keyboard.press('Escape')
    await expect(progressModal).toBeHidden()

    // 历史里的删除也是文本按钮，点开二次确认；先点「取消」：事项还在（first 是取消）
    await page.getByTestId('todo-history-delete').click()
    await expect(page.getByText('删除事项「写周报」？')).toBeVisible()
    await page.locator('.ant-popconfirm-buttons button').first().click()
    await expect(page.getByText('删除事项「写周报」？')).toBeHidden()
    await expect(page.getByTestId('todo-history-item')).toHaveCount(1)

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
    expect(progress).toEqual({ content: '完成一大半，剩收尾', done: 1 })

    // 二次确认点「删除」：历史与库里都不再有这一条
    await page.getByTestId('todo-history-delete').click()
    await expect(page.getByText('删除事项「写周报」？')).toBeVisible()
    await page.locator('.ant-popconfirm-buttons button').last().click()
    await expect(page.getByTestId('todo-history-item')).toHaveCount(0)
    const afterDelete = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    try {
      const remaining = afterDelete.prepare('SELECT COUNT(*) AS n FROM todo_item').get() as {
        n: number
      }
      expect(remaining.n).toBe(0)
    } finally {
      afterDelete.close()
    }
  } finally {
    await electronApp.close()
    rmSync(root, { recursive: true, force: true })
  }
})




