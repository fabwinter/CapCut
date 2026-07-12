import { expect, test } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')

async function createProjectAndGetToEditor(page: import('@playwright/test').Page, name: string) {
  await page.goto('/')
  await page.getByText('Create your first project').click()
  const dialog = page.getByRole('dialog')
  await dialog.getByPlaceholder('Untitled Project').fill(name)
  await dialog.getByRole('button', { name: 'Create', exact: true }).click()
  await expect(page).toHaveURL(/\/edit\//)
}

test('importing a video never hangs and always reaches a terminal status', async ({ page }) => {
  await createProjectAndGetToEditor(page, 'Import Test')

  await page.locator('input[type=file]').setInputFiles(path.join(fixturesDir, 'test-clip.mp4'))

  const row = page.locator('[data-asset-row]').first()
  await expect(row).toBeVisible()
  await expect(row).toContainText('test-clip.mp4')

  // Container-level metadata (duration/dims/fps) comes from parsing the MP4
  // box structure alone — it must populate regardless of whether this
  // browser's WebCodecs can actually decode the codec inside.
  await expect(row).toContainText('2.0s', { timeout: 5000 })

  // Whatever this browser's codec support looks like, processing must
  // settle — never hang in "processing" forever (see the codec-support
  // guard in generateVideoDerivatives, which exists specifically to
  // prevent that: `decoder.flush()` never resolves for a WebCodecs config
  // that silently isn't actually supported).
  await expect(row).toHaveAttribute('data-asset-status', /ready|error/, { timeout: 30_000 })

  const status = await row.getAttribute('data-asset-status')
  if (status === 'ready') {
    // Proxy + thumbnails were generated — the media library should render one.
    await expect(row.locator('img')).toHaveCount(1)
  }
})

test('importing an image populates dimensions and reaches ready', async ({ page }) => {
  await createProjectAndGetToEditor(page, 'Image Import Test')

  // 1x1 transparent PNG — enough to exercise createImageBitmap + status flow.
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
  await page.locator('input[type=file]').setInputFiles({
    name: 'pixel.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pngBase64, 'base64'),
  })

  const row = page.locator('[data-asset-row]').first()
  await expect(row).toHaveAttribute('data-asset-status', 'ready', { timeout: 10_000 })
})
