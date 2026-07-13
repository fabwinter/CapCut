/**
 * PWA utilities: service worker registration, storage monitoring, wake lock.
 */

/**
 * Register service worker for offline support.
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) {
    console.warn('Service Worker API not supported')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register('/service-worker.js', {
      scope: '/',
    })
    console.log('Service Worker registered:', registration)

    // Listen for updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'activated') {
            console.log('Service Worker updated')
            // Notify user to reload
            window.dispatchEvent(new CustomEvent('sw-updated'))
          }
        })
      }
    })

    return registration
  } catch (error) {
    console.error('Service Worker registration failed:', error)
    return null
  }
}

/**
 * Skip waiting: activate new service worker immediately.
 */
export function skipWaiting(): void {
  if (navigator.serviceWorker?.controller) {
    navigator.serviceWorker.controller.postMessage({ type: 'SKIP_WAITING' })
  }
}

/**
 * Monitor storage quota and usage.
 */
export async function getStorageQuota(): Promise<{
  usage: number
  quota: number
  percent: number
}> {
  if (!('storage' in navigator) || !('estimate' in navigator.storage)) {
    console.warn('Storage Estimate API not supported')
    return { usage: 0, quota: 0, percent: 0 }
  }

  try {
    const estimate = await navigator.storage.estimate()
    const usage = estimate.usage || 0
    const quota = estimate.quota || 0
    const percent = quota > 0 ? (usage / quota) * 100 : 0

    return { usage, quota, percent }
  } catch (error) {
    console.error('Storage quota estimation failed:', error)
    return { usage: 0, quota: 0, percent: 0 }
  }
}

/**
 * Request persistent storage permission (iOS 16+, Android 6+).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!('storage' in navigator) || !('persist' in navigator.storage)) {
    console.warn('Persistent Storage API not supported')
    return false
  }

  try {
    const persistent = await navigator.storage.persist()
    console.log('Persistent storage:', persistent ? 'granted' : 'denied')
    return persistent
  } catch (error) {
    console.error('Persistent storage request failed:', error)
    return false
  }
}

/**
 * Wake lock: keep screen on during export/playback.
 */
export async function acquireWakeLock(): Promise<WakeLockSentinel | null> {
  if (!('wakeLock' in navigator)) {
    console.warn('Wake Lock API not supported')
    return null
  }

  try {
    const sentinel = await (navigator as any).wakeLock.request('screen')
    console.log('Wake lock acquired')

    sentinel.addEventListener('release', () => {
      console.log('Wake lock released')
    })

    return sentinel
  } catch (error) {
    console.error('Wake lock request failed:', error)
    return null
  }
}

/**
 * Release wake lock.
 */
export async function releaseWakeLock(sentinel: WakeLockSentinel): Promise<void> {
  try {
    await sentinel.release()
  } catch (error) {
    console.error('Wake lock release failed:', error)
  }
}

/**
 * Get device orientation (iOS/Android).
 */
export function getDeviceOrientation(): 'portrait' | 'landscape' | 'unknown' {
  if (typeof window === 'undefined') return 'unknown'

  const angle = (window as any).orientation ?? window.screen.orientation?.angle ?? 0
  if (angle === 0 || angle === 180) return 'portrait'
  if (angle === 90 || angle === 270) return 'landscape'
  return 'unknown'
}

/**
 * Listen for orientation changes.
 */
export function onOrientationChange(callback: (orientation: 'portrait' | 'landscape') => void): () => void {
  const listener = () => {
    const orientation = getDeviceOrientation()
    if (orientation !== 'unknown') {
      callback(orientation)
    }
  }

  window.addEventListener('orientationchange', listener)
  return () => window.removeEventListener('orientationchange', listener)
}

/**
 * WebGL context loss recovery.
 * Call this when rendering to handle context loss.
 */
export function setupWebGLRecovery(canvas: HTMLCanvasElement, onRestore: () => void): void {
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault()
    console.warn('WebGL context lost')
  })

  canvas.addEventListener('webglcontextrestored', () => {
    console.log('WebGL context restored')
    onRestore()
  })
}
