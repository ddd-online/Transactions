import { expect, type Page } from '@playwright/test'

/** 从标题栏应用菜单创建账本；创建完成后当前账本即新账本。 */
export async function createLedger(page: Page, name: string): Promise<void> {
  await page.getByTestId('app-menu-trigger').click()
  await page.getByTestId('ledger-open-create').click()
  await page.getByTestId('ledger-name').fill(name)
  await page.getByTestId('ledger-create').click()
  await expect(page.getByTestId('ledger-state')).toContainText(name)
}
