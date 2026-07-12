/**
 * Registers the hand-rolled service worker (public/sw.js) — production
 * only, so dev's HMR and always-fresh module graph aren't shadowed by a
 * stale cache-first asset.
 */
export function registerServiceWorker(): void {
  if (typeof window === 'undefined') return
  if (!('serviceWorker' in navigator)) return
  if (!import.meta.env.PROD) return

  // Called from a client-side effect after hydration, so the page's own
  // `load` event has already fired by this point — registering immediately
  // (rather than waiting on a `load` listener that will never see the event)
  // is what actually gets the worker installed.
  navigator.serviceWorker.register('/sw.js').catch((err: unknown) => {
    console.warn('Service worker registration failed', err)
  })
}
