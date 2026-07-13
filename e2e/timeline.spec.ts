import { expect, test } from '@playwright/test'

// 1x1 transparent PNG — image assets skip codec/proxy generation entirely and
// always reach "ready", so the timeline gesture tests aren't at the mercy of
// this browser's WebCodecs hardware decode support (see media-import.spec.ts,
// which documents that video import can legitimately land on "error" here).
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
  const clip = page.locator('[data-clip]').first()
  await expect(clip).toBeVisible()
  return clip
}

test('drag moves a clip and undo reverts it', async ({ page }) => {
  const clip = await createProjectWithClipOnTimeline(page, 'Drag Test')
  const before = await clip.boundingBox()
  expect(before).not.toBeNull()

  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2)
  await page.mouse.down()
  await page.mouse.move(before!.x + before!.width / 2 + 100, before!.y + before!.height / 2, { steps: 5 })
  await page.mouse.up()

  const after = await clip.boundingBox()
  expect(after!.x).toBeGreaterThan(before!.x + 50)

  await page.getByRole('button', { name: 'Undo' }).click()
  const reverted = await clip.boundingBox()
  expect(Math.abs(reverted!.x - before!.x)).toBeLessThan(5)
})

test('trimming the end handle shrinks the clip and undo reverts it', async ({ page }) => {
  const clip = await createProjectWithClipOnTimeline(page, 'Trim Test')
  const before = await clip.boundingBox()

  const handle = clip.locator('[data-trim-handle="end"]')
  const handleBox = await handle.boundingBox()
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2)
  await page.mouse.down()
  await page.mouse.move(handleBox!.x - 40, handleBox!.y + handleBox!.height / 2, { steps: 5 })
  await page.mouse.up()

  const after = await clip.boundingBox()
  expect(after!.width).toBeLessThan(before!.width - 10)

  await page.getByRole('button', { name: 'Undo' }).click()
  const reverted = await clip.boundingBox()
  expect(Math.abs(reverted!.width - before!.width)).toBeLessThan(5)
})

test('split at the playhead creates two clips, undo/redo toggle it', async ({ page }) => {
  const clip = await createProjectWithClipOnTimeline(page, 'Split Test')

  await clip.click()
  const ruler = page.locator('[data-timeline-ruler]')
  await ruler.click({ position: { x: 60, y: 10 } })

  await page.locator('[data-action="split"]').click()
  await expect(page.locator('[data-clip]')).toHaveCount(2)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('[data-clip]')).toHaveCount(1)

  await page.getByRole('button', { name: 'Redo' }).click()
  await expect(page.locator('[data-clip]')).toHaveCount(2)
})

test('deleting the selected clip removes it from the timeline', async ({ page }) => {
  const clip = await createProjectWithClipOnTimeline(page, 'Delete Test')
  await clip.click()
  await page.locator('[data-action="delete"]').click()
  await expect(page.locator('[data-clip]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(page.locator('[data-clip]')).toHaveCount(1)
})

test('jump-to-end and jump-to-start move the playhead across the project', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Jump Nav Test')
  const playhead = page.locator('[data-playhead]')
  const startBox = await playhead.boundingBox()

  await page.locator('[data-action="jump-to-end"]').click()
  const endBox = await playhead.boundingBox()
  expect(endBox!.x).toBeGreaterThan(startBox!.x + 5)

  await page.locator('[data-action="jump-to-start"]').click()
  const backAtStart = await playhead.boundingBox()
  expect(Math.abs(backAtStart!.x - startBox!.x)).toBeLessThan(2)
})

test('frame step buttons nudge the playhead forward and back by a single frame', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Frame Step Test')
  const playhead = page.locator('[data-playhead]')
  const before = await playhead.boundingBox()

  await page.locator('[data-action="step-frame-forward"]').click()
  const afterForward = await playhead.boundingBox()
  expect(afterForward!.x).toBeGreaterThan(before!.x)

  await page.locator('[data-action="step-frame-back"]').click()
  const afterBack = await playhead.boundingBox()
  expect(Math.abs(afterBack!.x - before!.x)).toBeLessThan(1)
})

test('zoom-to-fit scales the timeline so the whole project fills the visible viewport', async ({ page }) => {
  const clip = await createProjectWithClipOnTimeline(page, 'Zoom To Fit Test')

  // Zoom far out first so the short 3s default clip is tiny on screen.
  for (let i = 0; i < 6; i++) await page.locator('[data-action="zoom-out"]').click()
  const zoomedOut = await clip.boundingBox()

  await page.locator('[data-action="zoom-to-fit"]').click()
  const fitted = await clip.boundingBox()
  expect(fitted!.width).toBeGreaterThan(zoomedOut!.width)
})

test('Home/End/ArrowLeft/ArrowRight keyboard shortcuts move the playhead', async ({ page }) => {
  await createProjectWithClipOnTimeline(page, 'Keyboard Nav Test')
  const playhead = page.locator('[data-playhead]')
  const startBox = await playhead.boundingBox()

  await page.keyboard.press('End')
  const endBox = await playhead.boundingBox()
  expect(endBox!.x).toBeGreaterThan(startBox!.x + 5)

  await page.keyboard.press('ArrowLeft')
  const afterLeft = await playhead.boundingBox()
  expect(afterLeft!.x).toBeLessThan(endBox!.x)

  await page.keyboard.press('Home')
  const backAtStart = await playhead.boundingBox()
  expect(Math.abs(backAtStart!.x - startBox!.x)).toBeLessThan(2)
})
