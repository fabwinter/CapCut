import { expect, test } from '@playwright/test'

// Image assets skip codec/proxy generation and always reach "ready" — see timeline.spec.ts.
const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function createProjectWithClipOnTimeline(page: import('@playwright/test').Page, name: string) {
  await page.goto('/')
  await page.getByText('Create your first project').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Untitled Project').fill(name)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\//)

  await page.locator('input[type=file]').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(PNG_BASE64, 'base64'),
  })
  const row = page.locator('[data-asset-row]').first()
  await expect(row).toHaveAttribute('data-asset-status', 'ready', { timeout: 10_000 })
  await row.locator('[data-add-to-timeline]').click()
  await expect(page.locator('[data-clip]').first()).toBeVisible()
}

test('export dialog opens with a resolution picker', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Export UI Test')
  await page.locator('[data-action="export"]').click()

  const exportDialog = page.locator('[data-export-dialog]')
  await expect(exportDialog).toBeVisible()
  await expect(exportDialog.locator('[data-preset="720p"]')).toBeVisible()
  await expect(exportDialog.locator('[data-preset="1080p"]')).toBeVisible()
})

test('starting an export reaches a terminal state — a downloadable file if this browser can encode H.264, a clear error otherwise', async ({
  page,
}) => {
  await createProjectWithClipOnTimeline(page, 'Export Flow Test')
  await page.locator('[data-action="export"]').click()
  await page.locator('[data-preset="720p"]').click()
  await page.locator('[data-action="start-export"]').click()

  const exportDialog = page.locator('[data-export-dialog]')
  await expect(exportDialog.locator('[data-export-state="done"], [data-export-state="error"]')).toBeVisible({
    timeout: 60_000,
  })

  const state = await exportDialog
    .locator('[data-export-state]')
    .first()
    .getAttribute('data-export-state')

  if (state === 'done') {
    await expect(exportDialog.locator('[data-export-download]')).toBeVisible()
  } else {
    await expect(exportDialog).toContainText(/cannot encode/i)
  }
})

test('closing and reopening the dialog resets it to the resolution picker', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Export Reset Test')
  await page.locator('[data-action="export"]').click()
  await page.locator('[data-action="start-export"]').click()

  const exportDialog = page.locator('[data-export-dialog]')
  await expect(exportDialog.locator('[data-export-state="done"], [data-export-state="error"]')).toBeVisible({
    timeout: 60_000,
  })

  await page.locator('[data-action="close-export"]').click()
  await expect(exportDialog).not.toBeVisible()

  await page.locator('[data-action="export"]').click()
  await expect(exportDialog.locator('[data-preset="1080p"]')).toBeVisible()
})
