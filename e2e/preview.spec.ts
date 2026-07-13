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

test('tapping the canvas selects the clip under the pointer', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Canvas Select Test')

  const canvas = page.locator('[data-preview-canvas]')
  const box = (await canvas.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

  await expect(canvas).not.toHaveAttribute('data-selected-clip', '')
  await expect(page.locator('[data-selection-overlay]')).toBeVisible()
  await expect(page.locator('[data-action="split"]')).toBeVisible()
})

test('dragging a selected clip on the canvas moves it and undo reverts', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Canvas Drag Test')

  const canvas = page.locator('[data-preview-canvas]')
  const box = (await canvas.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)
  await expect(page.locator('[data-selection-overlay]')).toBeVisible()

  const overlay = page.locator('[data-selection-overlay] polygon')
  const before = await overlay.getAttribute('points')

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 40, { steps: 5 })
  await page.mouse.up()

  const after = await overlay.getAttribute('points')
  expect(after).not.toBe(before)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(overlay).toHaveAttribute('points', before!)
})

test('a long timeline never pushes the preview canvas or inspector off-screen', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Layout Blowout Test')

  // Grow the timeline well past the viewport width (each clip is 3s; default
  // zoom is 60px/s). Before the min-w-0 fix, the middle column's min-width
  // tracked this content width and shoved the canvas + inspector off-screen.
  const row = page.locator('[data-asset-row]').first()
  for (let i = 2; i <= 8; i++) {
    await row.locator('[data-add-to-timeline]').click()
    // Clip rendering is virtualized, so wait on the doc-driven duration readout instead of DOM node count.
    await expect(page.getByText(`0:00 / 0:${String(i * 3).padStart(2, '0')}`)).toBeVisible()
  }

  const viewport = page.viewportSize()!
  const canvasBox = (await page.locator('[data-preview-canvas]').boundingBox())!
  expect(canvasBox.x).toBeGreaterThanOrEqual(0)
  expect(canvasBox.x + canvasBox.width).toBeLessThanOrEqual(viewport.width + 1)

  const inspectorBox = (await page.locator('[data-inspector]').boundingBox())!
  expect(inspectorBox.x + inspectorBox.width).toBeLessThanOrEqual(viewport.width + 1)

  // And the canvas box must still be the project's aspect ratio (9:16 default),
  // not distorted by a broken height/max-width interaction.
  expect(canvasBox.width / canvasBox.height).toBeCloseTo(9 / 16, 1)
})

test('play toggles to pause and advances the transport time', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Playback Test')

  await expect(page.getByText('0:00 / 0:03')).toBeVisible()
  await page.locator('[data-action="play"]').click()
  await expect(page.locator('[data-action="pause"]')).toBeVisible()

  // formatTime only shows whole seconds — wait past a full second so the
  // readout visibly advances from the audio clock.
  await expect(page.getByText('0:00 / 0:03')).not.toBeVisible({ timeout: 3000 })

  await page.locator('[data-action="pause"]').click()
  await expect(page.locator('[data-action="play"]')).toBeVisible()
})
