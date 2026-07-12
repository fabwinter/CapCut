// Hand-rolled service worker (no build step — this file is served as-is
// from /sw.js). Two caches, two strategies:
//
//  - /assets/* is Vite's content-hashed, immutable output (see vercel.json's
//    Cache-Control on that path) — safe to cache-first forever, since a
//    changed file is a changed URL.
//  - Navigations (the SSR'd app shell) are network-first with a cache
//    fallback, so a fresh deploy is picked up immediately online, but the
//    app still opens offline once it's been visited at least once.
//
// This makes "offline editing works end-to-end" true for a project you've
// already opened: the shell + JS/CSS load from cache, and all project data
// lives in IndexedDB/OPFS already (see ARCHITECTURE.md's local-first model),
// neither of which a service worker needs to be involved in.

const VERSION = 'v1'
const ASSET_CACHE = `capcut-assets-${VERSION}`
const SHELL_CACHE = `capcut-shell-${VERSION}`
const CURRENT_CACHES = new Set([ASSET_CACHE, SHELL_CACHE])

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !CURRENT_CACHES.has(key)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request))
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
  }
})

async function cacheFirst(request) {
  const cache = await caches.open(ASSET_CACHE)
  const cached = await cache.match(request)
  if (cached) return cached
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (err) {
    const cached = (await cache.match(request)) ?? (await cache.match('/'))
    if (cached) return cached
    throw err
  }
}
