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

test('股票心得：新建 / 关联轮次 / 跳转 / 编辑 / 删除', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-stock-lessons-'))
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
    await page.getByTestId('nav-settings').click()
    await createLedger(page, '心得账本')
    const ledgerId = await page.evaluate(async () => {
      const rows = await window.api.invoke('ledger_list', { id: 'all' })
      return rows.find((row) => row.name === '心得账本')?.id ?? ''
    })

    const roundIds = await page.evaluate(async (id) => {
      await window.api.invoke('stock_principal_add', {
        ledger_id: id,
        amount: 1_000_000,
        date: '',
      })
      const at = (day: number): number =>
        Math.trunc(new Date(2026, 9, day, 12, 0, 0).getTime() / 1000)
      for (const round of [
        { open: at(1), close: at(5) },
        { open: at(10), close: at(15) },
      ]) {
        for (const trade of [
          { type: 'open', time: round.open, price: 10 },
          { type: 'close', time: round.close, price: 11 },
        ]) {
          await window.api.invoke('stock_trade_create', {
            ledger_id: id,
            stock_code: '600000',
            stock_name: '浦发银行',
            trade_type: trade.type,
            trade_time: trade.time,
            remark: '',
            tag: '',
            fills: [],
            price: trade.price,
            lots: 10,
          })
        }
      }
      const detail = await window.api.invoke('stock_history_detail', {
        ledger_id: id,
        stock_code: '600000',
      })
      return detail.rounds.map((round) => round.id)
    }, ledgerId)

    await page.getByTestId('nav-stock').click()
    await page.getByTestId('stock-tab-lessons').click()
    await expect(page.getByTestId('stock-lesson-empty')).toContainText('还没有心得')
    await expect(page.getByTestId('stock-lesson-create')).toBeVisible()

    // 从记录页某一轮直接记心得：来源已预选
    await page.getByTestId('stock-tab-history').click()
    await expect(page.getByTestId('stock-round')).toHaveCount(2)
    const latestRound = page.getByTestId('stock-round').nth(1)
    await latestRound.getByTestId('round-lesson-create').click()
    const createDialog = page.getByRole('dialog', { name: '新建心得' })
    await expect(createDialog).toBeVisible()
    await expect(page.getByTestId('stock-lesson-stock')).toContainText('浦发银行')
    await expect(page.getByTestId('stock-lesson-stock')).toHaveClass(/ant-select-disabled/)
    await expect(page.getByTestId('stock-lesson-round')).toContainText('第 2 轮')
    await expect(page.getByTestId('stock-lesson-round')).toHaveClass(/ant-select-disabled/)
    await page.getByTestId('stock-lesson-text').fill('等回踩确认再买，不追第一根阳线')
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-lesson-dialog.png'),
    })
    await page.getByTestId('stock-lesson-save').click()
    await expect(page.getByTestId('toast').last()).toContainText('心得已保存')
    await expect(createDialog).toBeHidden()

    await page.getByTestId('stock-tab-lessons').click()
    const rows = page.getByTestId('stock-lesson-row')
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('等回踩确认再买，不追第一根阳线')
    await expect(rows.first()).toContainText('浦发银行')
    await expect(rows.first()).toContainText('600000')
    await expect(rows.first()).toContainText('第 2 轮')
    await expect(rows.first()).toContainText('2026-10-10 → 2026-10-15')

    // 编辑
    await rows.first().getByTestId('stock-lesson-edit').click()
    const editDialog = page.getByRole('dialog', { name: '编辑心得' })
    await expect(editDialog).toBeVisible()
    await expect(page.getByTestId('stock-lesson-text')).toHaveValue('等回踩确认再买，不追第一根阳线')
    await page.getByTestId('stock-lesson-text').fill('等回踩确认再买，不追第一根阳线，也不补仓')
    await page.getByTestId('stock-lesson-save').click()
    await expect(rows.first()).toContainText('也不补仓')
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-lessons.png'),
    })

    // 跳回关联的那一轮，并短暂高亮
    await rows.first().getByTestId('stock-lesson-jump').click()
    await expect(page.getByTestId('stock-tab-history')).toHaveClass(/is-active/)
    await expect(page.getByTestId('stock-round').nth(1)).toHaveClass(/is-arrived/)
    await expect(
      page.getByTestId('stock-round').nth(1).locator('.stock-round__body'),
    ).toBeVisible()

    // 新建一条不关联的心得
    await page.getByTestId('stock-tab-lessons').click()
    await page.getByTestId('stock-lesson-create').click()
    await page.getByTestId('stock-lesson-text').fill('空仓也是一种仓位')
    await page.getByTestId('stock-lesson-save').click()
    await expect(rows).toHaveCount(2)
    const standalone = rows.filter({ hasText: '空仓也是一种仓位' })
    await expect(standalone).toContainText('未关联交易轮次')
    await expect(standalone.getByTestId('stock-lesson-jump')).toBeDisabled()

    // 删除只删心得，交易轮次不受影响
    await standalone.getByTestId('stock-lesson-delete').click()
    await page.getByText('删除这条心得？').waitFor()
    await page.waitForTimeout(200)
    await page.screenshot({
      path: join(repositoryRoot, 'artifacts', 'tests', 'stock-lesson-delete.png'),
    })
    await page.locator('.ant-popover button').filter({ hasText: '删' }).last().click()
    await expect(rows).toHaveCount(1)

    // 从心得页新建：先选股票，再选该股票的轮次
    await page.getByTestId('stock-lesson-create').click()
    await page.getByTestId('stock-lesson-text').fill('先选股票再选轮次')
    await page.getByTestId('stock-lesson-stock').click()
    await page
      .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      .filter({ hasText: '浦发银行' })
      .first()
      .click()
    await page.getByTestId('stock-lesson-round').click()
    await page
      .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option')
      .filter({ hasText: '第 1 轮' })
      .first()
      .click()
    await page.getByTestId('stock-lesson-save').click()
    await expect(rows).toHaveCount(2)
    const linkedByPicker = rows.filter({ hasText: '先选股票再选轮次' })
    await expect(linkedByPicker).toContainText('第 1 轮')

    await linkedByPicker.getByTestId('stock-lesson-delete').click()
    await page.getByText('删除这条心得？').waitFor()
    await page.locator('.ant-popover button').filter({ hasText: '删' }).last().click()
    await expect(rows).toHaveCount(1)

    const database = new DatabaseSync(join(workspace, 'transactions.db'), { readOnly: true })
    const lessons = database
      .prepare('SELECT text, round_id, stock_code, round_no FROM stock_lesson')
      .all() as Array<{ text: string; round_id: string; stock_code: string; round_no: number }>
    const roundCount = database
      .prepare('SELECT COUNT(*) AS count FROM stock_trade_round')
      .get() as { count: number }
    database.close()
    expect(lessons).toHaveLength(1)
    expect(lessons[0].text).toContain('也不补仓')
    expect(lessons[0].round_id).toBe(roundIds[1])
    expect(lessons[0].stock_code).toBe('600000')
    expect(lessons[0].round_no).toBe(2)
    expect(roundCount.count).toBe(2)
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
