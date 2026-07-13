/**
 * CapCut Service Worker
 * Handles offline support, caching, and background sync.
 */

const CACHE_VERSION = 'capcut-v1'
const CACHE_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
]

// Install: cache essential assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_ASSETS).then((cache) => {
      return cache.addAll(CACHE_ASSETS)
    }).then(() => self.skipWaiting())
  )
})

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_VERSION) {
            return caches.delete(name)
          }
        })
      )
    }).then(() => self.clients.claim())
  )
})

// Fetch: network first, cache fallback for assets
self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Skip non-GET requests
  if (request.method !== 'GET') {
    return
  }

  // Skip external requests
  if (url.origin !== location.origin) {
    return
  }

  // API requests: network first with cache fallback
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const cache = caches.open(CACHE_VERSION)
            cache.then((c) => c.put(request, response.clone()))
          }
          return response
        })
        .catch(() => caches.match(request))
    )
    return
  }

  // App shell: cache first, network fallback
  event.respondWith(
    caches.match(request)
      .then((cached) => {
        if (cached) return cached
        return fetch(request)
          .then((response) => {
            if (response.ok && url.pathname !== '/') {
              const cache = caches.open(CACHE_VERSION)
              cache.then((c) => c.put(request, response.clone()))
            }
            return response
          })
      })
      .catch(() => {
        // Offline fallback: return offline page or 404
        if (url.pathname === '/') {
          return caches.match('/')
        }
        return new Response('Offline', { status: 503 })
      })
  )
})

// Message: handle requests from app
self.addEventListener('message', (event) => {
  const { type, payload } = event.data

  if (type === 'SKIP_WAITING') {
    self.skipWaiting()
  } else if (type === 'CLEAR_CACHE') {
    caches.delete(CACHE_VERSION)
    event.ports[0].postMessage({ cleared: true })
  }
})
