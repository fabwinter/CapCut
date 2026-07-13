import type { Micros } from '../doc/time'
import { snapToFrame } from '../doc/time'
import { readProxy } from './assetStorage'

/**
 * Frame quality mode for compositing/export.
 * - 'proxy': faster decoding, ~960×540, used during editing
 * - 'original': full res, used during export
 */
export type FrameQuality = 'proxy' | 'original'

/**
 * A single decoded frame + metadata.
 */
export interface DecodedFrame {
  frame: VideoFrame
  timeMicros: Micros
}

/**
 * LRU frame cache with byte budget.
 * Evicts oldest frames when budget exceeded.
 */
class FrameCache {
  private cache = new Map<string, DecodedFrame>()
  private accessOrder: string[] = []
  private readonly maxBytes: number

  constructor(maxBytes: number = 50 * 1024 * 1024) {
    // Default 50MB cache
    this.maxBytes = maxBytes
  }

  set(key: string, frame: DecodedFrame): void {
    // Remove old entry if exists
    if (this.cache.has(key)) {
      this.cache.get(key)?.frame.close()
      this.accessOrder = this.accessOrder.filter((k) => k !== key)
    }

    this.cache.set(key, frame)
    this.accessOrder.push(key)

    // Evict if over budget
    this.evictIfNeeded()
  }

  get(key: string): DecodedFrame | undefined {
    const frame = this.cache.get(key)
    if (frame) {
      // Move to end (most recently used)
      this.accessOrder = this.accessOrder.filter((k) => k !== key)
      this.accessOrder.push(key)
    }
    return frame
  }

  clear(): void {
    for (const frame of this.cache.values()) {
      frame.frame.close()
    }
    this.cache.clear()
    this.accessOrder = []
  }

  private evictIfNeeded(): void {
    // Simple heuristic: keep evicting oldest until we're under budget
    // (In production, track actual byte size; for now use frame count as proxy)
    const maxFrames = Math.max(30, Math.floor(this.maxBytes / (1920 * 1080 * 4))) // ~8MB per 1080p frame
    while (this.cache.size > maxFrames && this.accessOrder.length > 0) {
      const oldest = this.accessOrder.shift()
      if (oldest) {
        const frame = this.cache.get(oldest)
        if (frame) frame.frame.close()
        this.cache.delete(oldest)
      }
    }
  }
}

/**
 * Video element cache for frame extraction.
 * One video element per asset to avoid codec conflicts and enable seeking.
 */
class VideoElementCache {
  private videoElements = new Map<string, HTMLVideoElement>()

  private async createVideoElement(projectId: string, assetId: string): Promise<HTMLVideoElement> {
    const video = new (typeof globalThis !== 'undefined' && (globalThis as any).HTMLVideoElement || HTMLVideoElement)()
    video.crossOrigin = 'anonymous'
    video.style.display = 'none'

    try {
      const proxyFile = await readProxy(projectId, assetId)
      const url = URL.createObjectURL(proxyFile)
      video.src = url

      // Wait for metadata to load
      await new Promise<void>((resolve, reject) => {
        const handler = () => {
          video.removeEventListener('loadedmetadata', handler)
          video.removeEventListener('error', errorHandler)
          resolve()
        }
        const errorHandler = () => {
          video.removeEventListener('loadedmetadata', handler)
          video.removeEventListener('error', errorHandler)
          reject(new Error('Failed to load proxy video'))
        }
        video.addEventListener('loadedmetadata', handler)
        video.addEventListener('error', errorHandler)
      })

      return video
    } catch (error) {
      throw new Error(`Failed to create video element for asset ${assetId}: ${error}`)
    }
  }

  async get(projectId: string, assetId: string): Promise<HTMLVideoElement> {
    const key = `${projectId}-${assetId}`
    let video = this.videoElements.get(key)

    if (!video) {
      video = await this.createVideoElement(projectId, assetId)
      this.videoElements.set(key, video)
    }

    return video
  }

  clear(): void {
    for (const video of this.videoElements.values()) {
      if (video.src) {
        URL.revokeObjectURL(video.src)
      }
    }
    this.videoElements.clear()
  }
}

/**
 * Decoder pool with max 2 concurrent decoders (future implementation).
 * Currently stubbed; full implementation defers to M2+.
 */
class DecoderPool {
  // maxDecoders: reserved for future decoder pooling implementation

  constructor(_maxDecoders: number = 2) {
    // Pooling logic deferred to full M2 implementation
  }

  close(): void {
    // Cleanup decoders here
  }
}

/**
 * Frame source: provides decoded frames from assets with caching.
 * Uses video element for efficient frame extraction via canvas.
 */
export class FrameSource {
  private cache: FrameCache
  private decoderPool: DecoderPool
  private videoCache: VideoElementCache
  private projectId: string

  constructor(projectId: string = '') {
    this.cache = new FrameCache(50 * 1024 * 1024) // 50MB cache
    this.decoderPool = new DecoderPool(2)
    this.videoCache = new VideoElementCache()
    this.projectId = projectId
  }

  /**
   * Get a frame from an asset at a specific time.
   * - Returns cached frame if available
   * - Otherwise extracts from video element and caches
   * - Quality: 'proxy' for editing (faster), 'original' for export
   *
   * Note: Caller must close the VideoFrame when done to avoid memory leaks.
   */
  async getFrame(
    assetId: string,
    timeMicros: Micros,
    fps: number,
    quality: FrameQuality = 'proxy'
  ): Promise<DecodedFrame | null> {
    if (!this.projectId) {
      console.warn('FrameSource initialized without projectId')
      return null
    }

    // Snap time to frame boundary
    const snappedTime = snapToFrame(timeMicros, fps)
    const cacheKey = `${assetId}-${snappedTime}-${quality}`

    // Check cache
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    try {
      // Get or create video element for this asset
      const video = await this.videoCache.get(this.projectId, assetId)

      // Seek to the requested time (in seconds)
      const timeSeconds = snappedTime / 1_000_000
      video.currentTime = timeSeconds

      // Wait for the frame to be available
      await new Promise<void>((resolve, reject) => {
        const handler = () => {
          video.removeEventListener('seeked', handler)
          video.removeEventListener('error', errorHandler)
          resolve()
        }
        const errorHandler = () => {
          video.removeEventListener('seeked', handler)
          video.removeEventListener('error', errorHandler)
          reject(new Error('Failed to seek to frame'))
        }
        video.addEventListener('seeked', handler, { once: true })
        video.addEventListener('error', errorHandler, { once: true })

        // Set a timeout in case seek never completes
        const timeout = setTimeout(() => {
          video.removeEventListener('seeked', handler)
          video.removeEventListener('error', errorHandler)
          reject(new Error('Seek timeout'))
        }, 5000)

        video.addEventListener('seeked', () => clearTimeout(timeout), { once: true })
      })

      // Create an OffscreenCanvas to draw the video frame
      const canvas = new OffscreenCanvas(video.videoWidth, video.videoHeight)
      const ctx = canvas.getContext('2d')
      if (!ctx) {
        throw new Error('Failed to get canvas context')
      }

      // Draw the current frame
      ctx.drawImage(video, 0, 0)

      // Convert canvas to VideoFrame
      const videoFrame = new VideoFrame(canvas, {
        timestamp: snappedTime,
        duration: Math.round(1_000_000 / fps),
      })

      // Cache and return
      const decodedFrame: DecodedFrame = { frame: videoFrame, timeMicros: snappedTime }
      this.cache.set(cacheKey, decodedFrame)

      return decodedFrame
    } catch (error) {
      console.error('Failed to extract frame:', error)
      return null
    }
  }

  /**
   * Get multiple frames in a range (for compositing or export).
   * Returns async iterator for memory efficiency.
   */
  async *getFramesInRange(
    assetId: string,
    startMicros: Micros,
    endMicros: Micros,
    fps: number,
    quality: FrameQuality = 'proxy'
  ): AsyncGenerator<DecodedFrame> {
    let currentMicros = startMicros
    const frameMicros = Math.round(1_000_000 / fps)

    while (currentMicros < endMicros) {
      const frame = await this.getFrame(assetId, currentMicros, fps, quality)
      if (frame) {
        yield frame
      }
      currentMicros += frameMicros
    }
  }

  /**
   * Pre-warm the cache with frames around a time.
   * Useful for scrubbing performance.
   */
  async warmCache(
    assetId: string,
    centerMicros: Micros,
    windowMicros: Micros,
    fps: number,
    quality: FrameQuality = 'proxy'
  ): Promise<void> {
    const start = Math.max(0, centerMicros - windowMicros / 2)
    const end = centerMicros + windowMicros / 2

    for await (const _frame of this.getFramesInRange(assetId, start, end, fps, quality)) {
      // Just iterate to fill cache; frames are released after iteration
    }
  }

  /**
   * Clear all cached frames.
   */
  clearCache(): void {
    this.cache.clear()
  }

  /**
   * Close resources (video cache, decoders).
   */
  close(): void {
    this.cache.clear()
    this.decoderPool.close()
    this.videoCache.clear()
  }
}

// Global singleton instances (one per project)
const frameSourceInstances = new Map<string, FrameSource>()

export function getFrameSource(projectId: string): FrameSource {
  if (!frameSourceInstances.has(projectId)) {
    frameSourceInstances.set(projectId, new FrameSource(projectId))
  }
  return frameSourceInstances.get(projectId)!
}
