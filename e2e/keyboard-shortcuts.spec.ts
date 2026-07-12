import { expect, test } from '@playwright/test'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function createProjectWithClipOnTimeline(page: import('@playwright/test').Page, name: string) {
  await page.goto('/')
  await page.getByText('Create your first project').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Untitled Project').fill(name)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\//)

  await page.locator('[data-media-import-input]').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  })
  const row = page.locator('[data-asset-row]').first()
  await expect(row).toHaveAttribute('data-asset-status', 'ready', { timeout: 10_000 })
  await row.locator('[data-add-to-timeline]').click()
  await expect(page.locator('[data-clip]').first()).toBeVisible()
}

test('Delete key removes the selected clip and Cmd+Z undoes it', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Keyboard Delete Test')
  await page.locator('[data-clip]').first().click()

  await page.keyboard.press('Delete')
  await expect(page.locator('[data-clip]')).toHaveCount(0)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('[data-clip]')).toHaveCount(1)
})

test('Escape deselects the current clip', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Keyboard Escape Test')
  const canvas = page.locator('[data-preview-canvas]')
  await page.locator('[data-clip]').first().click()
  await expect(canvas).not.toHaveAttribute('data-selected-clip', '')

  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-selected-clip', '')
})

test('Space toggles play/pause', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Keyboard Space Test')

  await page.keyboard.press('Space')
  await expect(page.locator('[data-action="pause"]')).toBeVisible()

  await page.keyboard.press('Space')
  await expect(page.locator('[data-action="play"]')).toBeVisible()
})
