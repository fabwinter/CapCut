import { expect, test } from '@playwright/test'

test('manifest and icons are linked', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute('href', '/manifest.webmanifest')
  const manifestRes = await page.request.get('/manifest.webmanifest')
  expect(manifestRes.ok()).toBe(true)
  const manifest = await manifestRes.json()
  expect(manifest.display).toBe('standalone')
  expect(manifest.orientation).toBe('landscape-primary')
  expect(manifest.icons.length).toBeGreaterThan(0)
})

test('service worker registers and caches the app shell for offline use', async ({ page, context }) => {
  await page.goto('/')
  await page.waitForFunction(() => navigator.serviceWorker.getRegistration().then((r) => r?.active?.state === 'activated'))

  // Reload so the now-active worker actually controls this navigation and
  // caches it. Wait for both the controller to attach and the asset cache to
  // be non-empty, rather than a fixed delay — caching is async and a blind
  // timeout is exactly the kind of thing that gets flaky under parallel
  // test load.
  await page.reload()
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
  await page.waitForFunction(async () => {
    const keys = await caches.keys()
    const assetCacheKey = keys.find((k) => k.startsWith('capcut-assets-'))
    if (!assetCacheKey) return false
    const cache = await caches.open(assetCacheKey)
    return (await cache.keys()).length > 0
  })

  await context.setOffline(true)
  await page.reload()
  await expect(page).toHaveTitle(/CapCut/)
  await expect(page.getByText('No projects yet')).toBeVisible()
  await context.setOffline(false)
})
