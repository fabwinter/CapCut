import { expect, test } from '@playwright/test'

const PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

test('preview recovers from a lost WebGL context without erroring', async ({ page }) => {
  const pageErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto('/')
  await page.getByText('Create your first project').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Untitled Project').fill('Context Loss Test')
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

  // Confirm the pipeline draws before we break anything.
  const canvas = page.locator('[data-preview-canvas]')
  const box = (await canvas.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator('[data-selection-overlay]')).toBeVisible()

  // Simulate the GPU-reset/backgrounding scenario ARCHITECTURE §5 calls out.
  await page.evaluate(() => {
    const el = document.querySelector('[data-preview-canvas]') as HTMLCanvasElement
    const gl = el.getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_lose_context')
    ext?.loseContext()
  })
  await page.waitForTimeout(200)
  await page.evaluate(() => {
    const el = document.querySelector('[data-preview-canvas]') as HTMLCanvasElement
    const gl = el.getContext('webgl2')
    const ext = gl?.getExtension('WEBGL_lose_context')
    ext?.restoreContext()
  })
  await page.waitForTimeout(300)

  // Deselect and reselect — proves the compositor is drawing (and hit-testing
  // still resolves) after recovery, not just that no exception was thrown.
  await page.keyboard.press('Escape')
  await expect(canvas).toHaveAttribute('data-selected-clip', '')
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator('[data-selection-overlay]')).toBeVisible()

  expect(pageErrors).toEqual([])
})
