import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { _electron as electron, expect, test, type Page } from '@playwright/test'

import { createLedger } from './ledger-helper'

function environment(overrides: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string') result[key] = value
  }
  delete result.ELECTRON_RUN_AS_NODE
  return { ...result, ...overrides }
}

/** 在下拉里挑一项（AntD 把选项渲染成带 title 的 option 节点）。 */
async function pickOption(page: Page, selectTestId: string, text: string): Promise<void> {
  await page.getByTestId(selectTestId).click()
  // AntD 给每个 Select 都留着一个下拉节点（含读屏用的隐藏 listbox），只点当前这个
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last()
  await dropdown.locator(`.ant-select-item-option[title="${text}"]`).click()
}

/** 弹层里的确认按钮（列表上的删除用 Popconfirm）。 */
async function confirmPopover(page: Page): Promise<void> {
  await page.locator('.ant-popconfirm-buttons button:last-child').click()
}

test('分析：两张预设图表不可改名 / 改粒度 / 改曲线，自建图表能增删改曲线', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-charts-'))
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
    await createLedger(page, '分析账本')
    await page.getByTestId('nav-accounting').click()
    await page.getByTestId('acct-tab-charts').click()

    // 预设只有两张：月度消费趋势 / 年度消费趋势
    const items = page.getByTestId('chart-item')
    await expect(items).toHaveCount(2)
    await expect(items.nth(0)).toContainText('月度消费趋势')
    await expect(items.nth(1)).toContainText('年度消费趋势')

    // 预设：没有重命名、没有添加曲线、表格没有操作列、粒度置灰，只能整张删掉
    await items.nth(0).click()
    await expect(page.getByTestId('chart-preset-note')).toHaveCount(0)
    await expect(page.getByTestId('chart-rename')).toHaveCount(0)
    await expect(page.getByTestId('chart-line-add')).toHaveCount(0)
    await expect(page.getByTestId('chart-line-edit')).toHaveCount(0)
    await expect(page.getByTestId('chart-line-delete')).toHaveCount(0)
    await expect(page.getByTestId('chart-granularity')).toHaveClass(/ant-select-disabled/)
    await expect(page.locator('.da-chart__lines-actions')).toHaveCount(0)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'charts-preset.png'),
    })

    // 预设可以删除（删除按钮悬停才出现）
    await items.nth(1).hover()
    await items.nth(1).getByTestId('chart-delete').click()
    await confirmPopover(page)
    await expect(items).toHaveCount(1)

    // 删光之后不会自己长回来（预设只播种一次）
    await items.nth(0).hover()
    await items.nth(0).getByTestId('chart-delete').click()
    await confirmPopover(page)
    await expect(items).toHaveCount(0)
    await expect(page.getByTestId('chart-empty')).toContainText('暂无图表')
    await page.getByTestId('acct-tab-records').click()
    await page.getByTestId('acct-tab-charts').click()
    await expect(items).toHaveCount(0)

    // 自建图表：默认一条支出曲线，能继续添加
    await page.getByTestId('chart-open-create').click()
    await page.getByTestId('chart-title').fill('餐饮分析')
    await page.getByTestId('chart-create').click()
    await expect(items).toHaveCount(1)
    await expect(page.getByTestId('chart-rename')).toBeVisible()
    await expect(page.getByTestId('chart-line-add')).toBeVisible()

    await page.getByTestId('chart-line-add').click()
    await expect(page.getByTestId('chart-line-dialog')).toBeVisible()
    await page.getByTestId('chart-line-label').fill('餐饮')
    await pickOption(page, 'chart-line-type', '支出')
    await pickOption(page, 'chart-line-category', '餐饮美食')
    await pickOption(page, 'chart-line-tags', '外卖')
    await page.getByTestId('chart-line-description').fill('外卖')
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'charts-line-dialog.png'),
    })
    await page.getByTestId('chart-line-submit').click()
    await expect(page.getByTestId('toast').last()).toContainText('曲线已添加')
    await expect(page.getByTestId('chart-line-dialog')).toBeHidden()
    await expect(page.locator('.da-chart__lines')).toContainText('餐饮')

    const chartLines = (): string => {
      const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
      const row = database
        .prepare("SELECT chart_lines FROM chart WHERE title = '餐饮分析'")
        .get() as { chart_lines: string } | undefined
      database.close()
      return row?.chart_lines ?? ''
    }
    expect(chartLines()).toContain('"label":"餐饮"')
    expect(chartLines()).toContain('"category":"餐饮美食"')
    expect(chartLines()).toContain('"tags":["外卖"]')
    expect(chartLines()).toContain('"description":"外卖"')

    // 同名曲线被拒
    await page.getByTestId('chart-line-add').click()
    await page.getByTestId('chart-line-label').fill('餐饮')
    await page.getByTestId('chart-line-submit').click()
    await expect(page.getByTestId('chart-line-error')).toContainText('已经有名为「餐饮」的曲线')
    await page.getByTestId('chart-line-cancel').click()

    // 编辑一条曲线：改名 + 关掉离群值
    const rows = page.locator('.da-chart__lines .ant-table-tbody tr.ant-table-row')
    await expect(rows).toHaveCount(2)
    await rows.nth(1).getByTestId('chart-line-edit').click()
    await page.getByTestId('chart-line-label').fill('餐饮（外卖）')
    await page.getByTestId('chart-line-outlier').click()
    await page.getByTestId('chart-line-submit').click()
    await expect(page.getByTestId('toast').last()).toContainText('曲线已保存')
    await expect(rows.nth(1)).toContainText('餐饮（外卖）')
    expect(chartLines()).toContain('"label":"餐饮（外卖）"')
    expect(chartLines()).toContain('"includeOutlier":false')

    // 删除一条曲线
    await rows.nth(1).getByTestId('chart-line-delete').click()
    await confirmPopover(page)
    await expect(page.getByTestId('toast').last()).toContainText('曲线已删除')
    await expect(rows).toHaveCount(1)
    expect(chartLines()).not.toContain('餐饮（外卖）')

    // 删除最后一条：曲线表给空态（不是一行灰字）
    await rows.nth(0).getByTestId('chart-line-delete').click()
    await confirmPopover(page)
    await expect(rows).toHaveCount(0)
    await expect(page.getByTestId('chart-lines-empty')).toContainText('还没有曲线')
    await expect(page.getByTestId('chart-lines-empty')).toContainText('点右上角「添加曲线」建一条')
    // 画布这时说的是「没东西可画」，不是「这个范围没数据」——也不再摆第二个空态插画
    await expect(page.getByTestId('chart-canvas-hint')).toContainText('加一条曲线之后')
    await expect(page.getByTestId('chart-data-empty')).toHaveCount(0)
    expect(chartLines()).toBe('[]')

    // 自建图表可以改名、改粒度
    await page.getByTestId('chart-rename').click()
    await page.getByTestId('chart-rename-input').fill('外卖趋势')
    await page.getByTestId('chart-rename-save').click()
    await expect(page.getByTestId('toast').last()).toContainText('图表更新成功')
    await expect(page.locator('.da-chart__title')).toHaveText('外卖趋势')

    await pickOption(page, 'chart-granularity', '月')
    await page.waitForTimeout(300)
    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const updated = database
      .prepare("SELECT title, granularity FROM chart WHERE title = '外卖趋势'")
      .get() as { title: string; granularity: string } | undefined
    database.close()
    expect(updated?.granularity).toBe('month')
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'charts-custom.png'),
    })
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
