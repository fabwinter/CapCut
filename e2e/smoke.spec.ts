import { test, expect } from '@playwright/test'

test('app shell loads and is cross-origin isolated', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveTitle(/CapCut/)

  const isIsolated = await page.evaluate(() => self.crossOriginIsolated)
  expect(isIsolated).toBe(true)
})
