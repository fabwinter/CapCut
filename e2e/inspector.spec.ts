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

test('shows an empty state until a clip is selected', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Inspector Empty Test')
  await expect(page.locator('[data-inspector]')).toContainText('Select a clip')

  await page.locator('[data-clip]').first().click()
  await expect(page.locator('[data-inspector]')).not.toContainText('Select a clip')
  await expect(page.locator('[data-inspector] [data-field="speed"]')).toBeVisible()
})

test('toggling mute updates the clip and undo reverts it', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Inspector Mute Test')
  await page.locator('[data-clip]').first().click()

  const muteSwitch = page.locator('[data-inspector] [data-field="mute"]')
  await muteSwitch.click()
  await expect(muteSwitch).toHaveAttribute('data-checked', '')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(muteSwitch).not.toHaveAttribute('data-checked', '')
})

test('applying a built-in LUT renders without console errors, undo clears it', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(String(err)))

  await createProjectWithClipOnTimeline(page, 'Inspector LUT Test')
  await page.locator('[data-clip]').first().click()

  await expect(page.locator('[data-inspector]')).toContainText('LUT')
  await expect(page.locator('[data-field="lut-intensity"]')).not.toBeVisible()
  await page.locator('[data-field="lut-warm"]').click()
  await expect(page.locator('[data-field="lut-intensity"]')).toBeVisible()

  // Give the LUT bitmap fetch + a repaint a beat to happen before checking for errors.
  await page.waitForTimeout(300)
  expect(consoleErrors).toEqual([])

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('[data-field="lut-intensity"]')).not.toBeVisible()
})

test('setting a transition between two adjacent clips shows the duration control', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Inspector Transition Test')
  await page.locator('[data-clip]').first().click()
  await page.locator('[data-action="duplicate"]').click()
  await page.locator('[data-clip]').first().click()

  await expect(page.locator('[data-inspector]')).toContainText('Transition to next clip')
  await page.locator('[data-field="transition-crossDissolve"]').click()
  await expect(page.locator('[data-field="transition-duration"]')).toBeVisible()
  await expect(page.locator('[data-field="transition-none"]')).toBeVisible()
})

test('a transition between two adjacent clips shows a draggable marker in the timeline, and dragging it resizes the duration', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Inspector Transition Marker Test')
  await page.locator('[data-clip]').first().click()
  await page.locator('[data-action="duplicate"]').click()
  await page.locator('[data-clip]').first().click()
  await page.locator('[data-field="transition-crossDissolve"]').click()

  const marker = page.locator('[data-transition-marker]')
  await expect(marker).toBeVisible()
  const before = await page.locator('[data-field="transition-duration"]').innerText()

  const handle = page.locator('[data-transition-resize-handle]')
  const handleBox = await handle.boundingBox()
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox!.x - 30, handleBox!.y + handleBox!.height / 2, { steps: 5 })
  await page.mouse.up()

  const after = await page.locator('[data-field="transition-duration"]').innerText()
  expect(after).not.toBe(before)
})

test('a lone clip with no adjacent neighbor explains why transitions are unavailable, instead of hiding the section', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Inspector No Transition Test')
  await page.locator('[data-clip]').first().click()

  await expect(page.locator('[data-inspector]')).toContainText('Transition to next clip')
  await expect(page.locator('[data-field="transition-unavailable"]')).toBeVisible()
  await expect(page.locator('[data-field="transition-crossDissolve"]')).not.toBeVisible()
})

test('rotate 90 button steps the clip rotation and undo reverts it', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Inspector Rotate Test')
  await page.locator('[data-clip]').first().click()

  const degrees = page.locator('[data-field="rotation-degrees"]')
  await expect(degrees).toHaveText('0°')

  await page.locator('[data-field="rotate-90"]').click()
  await expect(degrees).toHaveText('90°')

  await page.locator('[data-field="rotate-90"]').click()
  await expect(degrees).toHaveText('180°')

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(degrees).toHaveText('90°')
})
