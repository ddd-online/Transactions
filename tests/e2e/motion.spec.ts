import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

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

/** 某个选择器上实际生效的过渡 / 动画时长（秒）。 */
async function timings(
  page: Page,
  selector: string,
): Promise<{ transitionSeconds: number[]; transitionProperties: string[]; animationName: string }> {
  return page.evaluate((target) => {
    const element = document.querySelector(target)
    if (!element) throw new Error(`找不到元素: ${target}`)
    const style = getComputedStyle(element)
    return {
      transitionSeconds: style.transitionDuration
        .split(',')
        .map((value) => Number.parseFloat(value) || 0),
      transitionProperties: style.transitionProperty.split(',').map((value) => value.trim()),
      animationName: style.animationName,
    }
  }, selector)
}

test('动效：按钮按压、表内行底色、展开层，以及减少动态下的兜底', async () => {
  const repositoryRoot = resolve(__dirname, '../..')
  const root = mkdtempSync(join(tmpdir(), 'tr-e2e-motion-'))
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
    await createLedger(page, '动效账本')
    const ledgerId = await page.evaluate(async () => {
      const rows = await window.api.invoke('ledger_list', { id: 'all' })
      return rows.find((row) => row.name === '动效账本')?.id ?? ''
    })
    await page.evaluate(async (id) => {
      await window.api.invoke('tr_create', {
        ledgerId: id,
        transactionId: '',
        transactionType: 'expense',
        price: 2_500,
        category: '餐饮美食',
        tags: [],
        description: '动效',
        transactionAt: Math.trunc(Date.now() / 1000),
        keyEventDate: '',
        outlier: false,
      })
    }, ledgerId)
    await page.getByTestId('nav-accounting').click()
    // 记一笔之后重新进「记录」标签，表格才会带着这一行重挂
    await page.getByTestId('acct-tab-charts').click()
    await page.getByTestId('acct-tab-records').click()
    await expect(page.locator('tr.ant-table-row').first()).toBeVisible()

    // 工具栏按钮：按下的 1px 也要有过渡（不是硬跳）。
    // 用独立的 `translate` 属性，不能写成 `transform` —— 那会覆盖按钮自己的定位变换。
    const button = await timings(page, '.tr-btn')
    expect(button.transitionProperties).toContain('translate')
    expect(button.transitionSeconds.some((seconds) => seconds > 0 && seconds <= 0.2)).toBe(true)

    // 表内行的悬停底色走过渡，指到哪一行不是"闪一下"
    const cell = await page.evaluate(() => {
      const element = document.querySelector('tr.ant-table-row > td')
      if (!element) return null
      const style = getComputedStyle(element)
      return { duration: style.transitionDuration, property: style.transitionProperty }
    })
    expect(cell).not.toBeNull()
    expect(cell!.property).toContain('background-color')
    expect(Number.parseFloat(cell!.duration)).toBeGreaterThan(0)

    // 展开的进度记录是"刚打开的一层"：面板进场那一拍
    await page.getByTestId('nav-todo').click()
    await page.getByTestId('todo-card-open').click()
    await page.getByTestId('todo-card-title').fill('动效主题')
    await page.getByTestId('todo-card-create').click()
    await page.getByTestId('todo-card').hover()
    await page.getByTestId('todo-item-add').click()
    await page.getByTestId('todo-item-title').fill('动效事项')
    await page.getByTestId('todo-item-create').click()
    await expect(page.getByTestId('todo-item')).toContainText('动效事项')
    await page.getByTestId('todo-item-toggle').first().click()
    await page.getByTestId('todo-progress-input').fill('第一条进度')
    await page.getByTestId('todo-progress-input').press('Enter')
    const progress = await timings(page, '.todo-progress')
    expect(progress.animationName).toBe('tr-rise-in')

    // 减少动态：全局兜底把每一拍压成瞬时，但内容仍然是可见的
    await page.emulateMedia({ reducedMotion: 'reduce' })
    const reduced = await page.evaluate(() => {
      const element = document.querySelector('.todo-progress')
      if (!element) throw new Error('找不到展开层')
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return {
        animationSeconds: Number.parseFloat(style.animationDuration),
        opacity: style.opacity,
        height: Math.round(rect.height),
      }
    })
    expect(reduced.animationSeconds).toBeLessThan(0.05)
    expect(reduced.opacity).toBe('1')
    expect(reduced.height).toBeGreaterThan(0)

    // 加载指示器是唯一的例外：全局兜底会把旋转压成一帧静态图，于是「还在忙」这一句
    // 就没了。这里不靠真实请求的时序，直接验样式表：一个 .anticon-spin 在减少动态下
    // 仍然在动，但动的是透明度而不是旋转。
    const busy = await page.evaluate(() => {
      const node = document.createElement('span')
      node.className = 'anticon anticon-spin'
      document.body.appendChild(node)
      const style = getComputedStyle(node)
      const result = {
        name: style.animationName,
        seconds: Number.parseFloat(style.animationDuration),
        count: style.animationIterationCount,
      }
      node.remove()
      return result
    })
    expect(busy.name).toBe('tr-busy-pulse')
    expect(busy.seconds).toBeGreaterThan(1)
    expect(busy.count).toBe('infinite')
  } finally {
    await app.close()
    rmSync(root, { recursive: true, force: true })
  }
})
