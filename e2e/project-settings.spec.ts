import { expect, test } from '@playwright/test'

async function canvasAspectRatio(page: import('@playwright/test').Page): Promise<number> {
  const box = await page.locator('[data-preview-canvas]').boundingBox()
  if (!box) throw new Error('preview canvas not visible')
  return box.width / box.height
}

test('choosing an aspect ratio at project creation sizes the canvas accordingly', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Create your first project').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Untitled Project').fill('Landscape Project')
  await dialog.locator('[data-aspect-ratio="16:9"]').click()
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\//)

  await expect
    .poll(async () => canvasAspectRatio(page), { timeout: 5000 })
    .toBeCloseTo(16 / 9, 1)
})

test('project settings dialog changes aspect ratio and frame rate on an existing project', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Create your first project').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Untitled Project').fill('Settings Test')
  // Default is "Auto" — leaves the portrait fallback (9:16) until a video sets it.
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\//)

  await expect
    .poll(async () => canvasAspectRatio(page), { timeout: 5000 })
    .toBeCloseTo(9 / 16, 1)

  await page.locator('[data-action="project-settings"]').click()
  const settingsDialog = page.locator('[data-project-settings-dialog]')
  await expect(settingsDialog).toBeVisible()
  await settingsDialog.locator('[data-aspect-ratio="1:1"]').click()
  await settingsDialog.locator('[data-fps="60"]').click()
  await settingsDialog.locator('[data-action="save-project-settings"]').click()
  await expect(settingsDialog).not.toBeVisible()

  await expect
    .poll(async () => canvasAspectRatio(page), { timeout: 5000 })
    .toBeCloseTo(1, 1)

  // Reopening should reflect what was actually saved, not stale dialog state.
  await page.locator('[data-action="project-settings"]').click()
  await expect(page.locator('[data-project-settings-dialog] [data-field="width"]')).toHaveValue('1080')
  await expect(page.locator('[data-project-settings-dialog] [data-field="height"]')).toHaveValue('1080')
  await expect(page.locator('[data-project-settings-dialog] [data-field="fps"]')).toHaveValue('60')
})
