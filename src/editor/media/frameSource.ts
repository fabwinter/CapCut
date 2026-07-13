import type { Micros } from '../doc/time'
import { snapToFrame } from '../doc/time'

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
 * Frame source: provides decoded frames from assets with caching + decoder pooling.
 * Coordinates with the media engine (proxy/original access).
 */
export class FrameSource {
  private cache: FrameCache
  private decoderPool: DecoderPool

  constructor() {
    this.cache = new FrameCache(50 * 1024 * 1024) // 50MB cache
    this.decoderPool = new DecoderPool(2)
  }

  /**
   * Get a frame from an asset at a specific time.
   * - Returns cached frame if available
   * - Otherwise fetches and decodes from media engine
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
    // Snap time to frame boundary
    const snappedTime = snapToFrame(timeMicros, fps)
    const cacheKey = `${assetId}-${snappedTime}-${quality}`

    // Check cache
    const cached = this.cache.get(cacheKey)
    if (cached) {
      return cached
    }

    // Future: implement actual decode + cache
    // For now, return null (placeholders in TimelineRenderer will handle)
    return null
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
   * Close resources (decoders).
   */
  close(): void {
    this.cache.clear()
    this.decoderPool.close()
  }
}

// Global singleton instance
let frameSourceInstance: FrameSource | null = null

export function getFrameSource(): FrameSource {
  if (!frameSourceInstance) {
    frameSourceInstance = new FrameSource()
  }
  return frameSourceInstance
}
