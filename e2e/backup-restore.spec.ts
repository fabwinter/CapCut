import { expect, test } from '@playwright/test'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

test('backing up a project and restoring it recreates the project with its media', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Create your first project').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Untitled Project').fill('Backup Restore Test')
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

  await page.goBack()
  await expect(page.getByText('Backup Restore Test')).toBeVisible()

  await page.getByRole('button', { name: /Actions for Backup Restore Test/ }).click()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('menuitem', { name: 'Backup' }).click(),
  ])
  const backupPath = await download.path()
  expect(backupPath).toBeTruthy()

  await page.locator('[data-action="restore-backup"]').click()
  await page.locator('[data-restore-backup-input]').setInputFiles(backupPath!)

  // Restore is a single blocking call (regenerates derivatives) then navigates to the new project.
  await expect(page).toHaveURL(/\/edit\//, { timeout: 30_000 })
  await expect(page.locator('[data-asset-row]').first()).toHaveAttribute('data-asset-status', 'ready', {
    timeout: 15_000,
  })

  await page.goBack()
  await expect(page.getByText('Backup Restore Test', { exact: false }).first()).toBeVisible()
})

test('restoring a non-backup file shows a clear error', async ({ page }) => {
  await page.goto('/')
  await page.locator('[data-action="restore-backup"]').click()
  await page.locator('[data-restore-backup-input]').setInputFiles({
    name: 'not-a-backup.zip',
    mimeType: 'application/zip',
    buffer: Buffer.from('not a real zip'),
  })
  await expect(page.locator('[data-restore-error]')).toBeVisible({ timeout: 10_000 })
})
