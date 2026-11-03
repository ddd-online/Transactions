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
  const dropdown = page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)').last()
  await dropdown.locator(`.ant-select-item-option[title="${text}"]`).click()
}

/** 读一行图表，用来断言落库的列。 */
function chartRow(
  workspace: string,
  title: string,
): { chart_type: string; group_field: string; group_transaction_type: string; chart_lines: string; granularity: string } | undefined {
  const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
  try {
    return database
      .prepare(
        'SELECT chart_type, group_field, group_transaction_type, chart_lines, granularity FROM chart WHERE title = ?',
      )
      .get(title) as
      | {
          chart_type: string
          group_field: string
          group_transaction_type: string
          chart_lines: string
          granularity: string
        }
      | undefined
  } finally {
    database.close()
  }
}

test('分析：饼图按分类 / 交易类型分组，分组配置就地生效', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-charts-pie-'))
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
    await createLedger(page, '饼图账本')
    const ledgerId = await page.evaluate(async () => {
      const rows = await window.api.invoke('ledger_list', { id: 'all' })
      return rows.find((row) => row.name === '饼图账本')?.id ?? ''
    })

    // 一个月内的四笔支出 + 一笔收入（同一段时间里两种交易类型都有记录）
    await page.evaluate(async (id) => {
      const at = (day: number): number => Math.trunc(new Date(2026, 9, day, 12, 0, 0).getTime() / 1000)
      await window.api.invoke('tr_batch_create', [
        { ledgerId: id, transactionId: '', price: 12_000, transactionType: 'expense', category: '餐饮美食', description: '午饭', tags: [], transactionAt: at(3), outlier: false, keyEventDate: '' },
        { ledgerId: id, transactionId: '', price: 3_000, transactionType: 'expense', category: '餐饮美食', description: '咖啡', tags: [], transactionAt: at(5), outlier: false, keyEventDate: '' },
        { ledgerId: id, transactionId: '', price: 4_000, transactionType: 'expense', category: '交通出行', description: '打车', tags: [], transactionAt: at(6), outlier: false, keyEventDate: '' },
        { ledgerId: id, transactionId: '', price: 50_000, transactionType: 'income', category: '工资', description: '月薪', tags: [], transactionAt: at(8), outlier: false, keyEventDate: '' },
      ])
    }, ledgerId)

    await page.getByTestId('nav-accounting').click()
    await page.getByTestId('acct-tab-charts').click()

    // ---- 饼图：按分类（支出）
    await page.getByTestId('chart-open-create').click()
    await page.getByTestId('chart-title').fill('支出构成')
    await page.getByTestId('chart-create-type-pie').click()
    // 默认就是「分类 + 支出」，分类时才出现交易类型
    await expect(page.getByTestId('chart-create-group')).toBeVisible()
    await expect(page.getByTestId('chart-create-group-type')).toBeVisible()
    await expect(page.getByTestId('chart-create-granularity')).toHaveCount(0)
    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'charts-pie-create.png'),
    })
    await page.getByTestId('chart-create').click()
    await expect(page.getByTestId('toast').last()).toContainText('图表创建成功')

    const pie = page.getByTestId('chart-pie')
    await expect(pie).toBeVisible()
    // 标题行没有时间粒度；底部是分组配置而不是曲线配置
    await expect(page.getByTestId('chart-granularity')).toHaveCount(0)
    await expect(page.getByTestId('chart-group-config')).toBeVisible()
    await expect(page.getByTestId('chart-line-add')).toHaveCount(0)

    // 合计列：按金额倒序，带金额与占比
    const sums = page.getByTestId('chart-pie-sums')
    await expect(sums).toContainText('分组合计')
    await expect(sums).toContainText('150.00')
    const rows = page.getByTestId('chart-pie-sum')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('餐饮美食')
    await expect(rows.nth(0)).toContainText('150.00')
    await expect(rows.nth(0)).toContainText('78.95%')
    await expect(rows.nth(1)).toContainText('交通出行')
    await expect(rows.nth(1)).toContainText('40.00')
    await expect(rows.nth(1)).toContainText('21.05%')

    // 落库：饼图没有曲线、没有粒度，分组两列写对
    expect(chartRow(workspace, '支出构成')).toEqual({
      chart_type: 'pie',
      group_field: 'category',
      group_transaction_type: 'expense',
      chart_lines: '[]',
      granularity: '',
    })

    // ---- 重命名：整行回写不能把分组写没
    await page.getByTestId('chart-rename').click()
    await page.getByTestId('chart-rename-input').fill('支出构成（改）')
    await page.getByTestId('chart-rename-save').click()
    await expect(page.getByTestId('toast').last()).toContainText('图表更新成功')
    expect(chartRow(workspace, '支出构成（改）')).toMatchObject({
      chart_type: 'pie',
      group_field: 'category',
      group_transaction_type: 'expense',
    })

    // ---- 分组配置：换成按交易类型，类型下拉消失，重新出图
    await pickOption(page, 'chart-group-field', '交易类型')
    await expect(page.getByTestId('chart-group-type')).toHaveCount(0)
    await expect(page.getByTestId('chart-pie-sum')).toHaveCount(2)
    await expect(page.getByTestId('chart-pie-sum').nth(0)).toContainText('收入')
    await expect(page.getByTestId('chart-pie-sum').nth(0)).toContainText('500.00')
    expect(chartRow(workspace, '支出构成（改）')).toMatchObject({
      group_field: 'transactionType',
      group_transaction_type: '',
    })

    // 换回分类：交易类型下拉回来，默认支出
    await pickOption(page, 'chart-group-field', '分类')
    await expect(page.getByTestId('chart-group-type')).toBeVisible()
    await expect(page.getByTestId('chart-pie-sum').nth(0)).toContainText('餐饮美食')

    // 截图等弹窗与提示条彻底退场：中途截会把收尾动画那一层半透明旧弹窗也拍进去
    await expect(page.getByTestId('toast')).toHaveCount(0, { timeout: 6000 })
    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'charts-pie-category.png'),
    })

    // 分类里换成收入：只剩「工资」一片
    await pickOption(page, 'chart-group-type', '收入')
    await expect(page.getByTestId('chart-pie-sum')).toHaveCount(1)
    await expect(page.getByTestId('chart-pie-sum').nth(0)).toContainText('工资')
    await page.waitForTimeout(300)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'charts-pie-income.png'),
    })

    // ---- 新开一个按交易类型的饼图：三片（范围内只有两种类型，收入最大在上）
    await page.getByTestId('chart-open-create').click()
    await page.getByTestId('chart-title').fill('收支构成')
    await page.getByTestId('chart-create-type-pie').click()
    await pickOption(page, 'chart-create-group', '交易类型')
    await expect(page.getByTestId('chart-create-group-type')).toHaveCount(0)
    await page.getByTestId('chart-create').click()
    await expect(page.getByTestId('chart-pie-sum').nth(0)).toContainText('收入')
    await expect(page.getByTestId('chart-pie-sum').nth(0)).toContainText('72.46%')
    expect(chartRow(workspace, '收支构成')).toMatchObject({
      chart_type: 'pie',
      group_field: 'transactionType',
      group_transaction_type: '',
    })

    // ---- 切回折线图（预设）时，曲线配置回来、饼图那套东西消失
    await page.getByTestId('chart-item').filter({ hasText: '月度消费趋势' }).click()
    await expect(page.getByTestId('chart-granularity')).toBeVisible()
    await expect(page.getByTestId('chart-group-config')).toHaveCount(0)
    await expect(page.getByTestId('chart-pie')).toHaveCount(0)

    // ---- 有记录、但这一种交易类型一条都没有：空态要说对这一件
    await page.getByTestId('chart-item').filter({ hasText: '支出构成（改）' }).click()
    await pickOption(page, 'chart-group-type', '转账')
    await expect(page.getByTestId('chart-data-empty')).toContainText('没有「转账」记录')
    await pickOption(page, 'chart-group-type', '支出')

    // ---- 空数据：范围内一笔记录都没有
    // 删光记录：先查一遍 id 再一条条删（没有「清空账本」这种命令）
    const ids = await page.evaluate(async (id) => {
      const result = await window.api.invoke('tr_query', {
        ledgerId: id,
        offset: -1,
        limit: -1,
        tsRange: [],
        items: [],
        sortFields: [],
      })
      return result.items.map((item) => item.transactionId)
    }, ledgerId)
    await page.evaluate(async (list) => {
      for (const transactionId of list) {
        await window.api.invoke('tr_delete', { id: transactionId })
      }
    }, ids)
    await page.getByTestId('acct-tab-records').click()
    await page.getByTestId('acct-tab-charts').click()
    await page.getByTestId('chart-item').filter({ hasText: '支出构成（改）' }).click()
    await expect(page.getByTestId('chart-data-empty')).toBeVisible()
    await expect(page.getByTestId('chart-data-empty')).toContainText('这个时间范围里没有记录')
    await expect(page.getByTestId('chart-pie')).toHaveCount(0)
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
