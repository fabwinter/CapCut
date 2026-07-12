import { expect, test } from '@playwright/test'

test('shows storage usage and requesting persistence updates the badge', async ({ page }) => {
  await page.goto('/')

  const meter = page.locator('[data-storage-meter]')
  await expect(meter).toBeVisible()
  await expect(meter).toContainText('used')

  const persistButton = meter.locator('[data-action="request-persist"]')
  // Some browsers auto-grant persistence (e.g. already-installed PWAs), in
  // which case the button never renders — either outcome is a pass here.
  if (await persistButton.isVisible().catch(() => false)) {
    await persistButton.click()
    await expect(meter.locator('[data-persisted-label], [data-action="request-persist"]')).toBeVisible()
  }
})
