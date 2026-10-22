import { expect, type Page } from '@playwright/test'

/** 从左上角账本菜单创建账本；创建完成后当前账本即新账本。 */
export async function createLedger(page: Page, name: string): Promise<void> {
  await page.getByTestId('ledger-trigger').click()
  await page.getByTestId('ledger-open-create').click()
  await page.getByTestId('ledger-name').fill(name)
  await page.getByTestId('ledger-create').click()
  await expect(page.getByTestId('ledger-trigger')).toContainText(name)
}
