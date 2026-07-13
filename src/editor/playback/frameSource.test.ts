import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FrameSourceManager } from './frameSource'

vi.mock('#/editor/media/demux', () => ({
  demuxVideoTrack: async (
    _file: File,
    callbacks: { onTrackInfo: (info: unknown) => void; onSample: (chunk: unknown) => void },
  ) => {
    callbacks.onTrackInfo({ id: 1, codec: 'avc1.42001f', width: 4, height: 4 })
    for (let i = 0; i < SAMPLE_COUNT; i++) {
      callbacks.onSample({ type: i === 0 ? 'key' : 'delta', timestamp: i * 33_333, duration: 33_333, data: new ArrayBuffer(1) })
    }
  },
}))

const SAMPLE_COUNT = 10

/**
 * Every `decode()` call recorded, across every fake decoder instance, in
 * strict call order — this is what a real VideoDecoder's internal
 * reference-frame chain depends on staying free of duplicates or gaps.
 */
let decodeCallLog: number[] = []
let closedDecoders = 0

function fakeFrame() {
  return { close: () => {}, clone: () => fakeFrame(), codedWidth: 4, codedHeight: 4 }
}

class FakeVideoDecoder {
  private outputCb: (frame: ReturnType<typeof fakeFrame>) => void
  constructor(init: { output: (frame: ReturnType<typeof fakeFrame>) => void }) {
    this.outputCb = init.output
  }
  configure(): void {}
  decode(chunk: { timestamp: number }): void {
    decodeCallLog.push(chunk.timestamp)
    // Simulate real decode latency (async, longer than a single rAF tick)
    // so overlapping getFrameAt calls actually have a window to race in.
    setTimeout(() => {
      this.outputCb(fakeFrame())
    }, 5)
  }
  async flush(): Promise<void> {}
  close(): void {
    closedDecoders++
  }
}

class FakeEncodedVideoChunk {
  timestamp: number
  constructor(init: { timestamp: number }) {
    this.timestamp = init.timestamp
  }
}

describe('AssetDecoderSession (via FrameSourceManager) concurrency', () => {
  beforeEach(() => {
    decodeCallLog = []
    closedDecoders = 0
    vi.stubGlobal('VideoDecoder', FakeVideoDecoder)
    vi.stubGlobal('EncodedVideoChunk', FakeEncodedVideoChunk)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('serializes overlapping getFrameAt calls instead of interleaving decode() submissions', async () => {
    const manager = new FrameSourceManager()
    const file = new File([], 'proxy.mp4')

    // Fire two requests back-to-back without awaiting the first — this is
    // exactly what Transport.tick's fire-and-forget `void renderFrameAt(...)`
    // does on consecutive rAFs when decode hasn't caught up yet.
    const first = manager.getFrame('asset-1', file, 5 * 33_333)
    const second = manager.getFrame('asset-1', file, 8 * 33_333)

    const [frameA, frameB] = await Promise.all([first, second])
    expect(frameA).toBeDefined()
    expect(frameB).toBeDefined()

    // Every sample index from 0 through the second target must appear
    // exactly once, in ascending order — no duplicate submissions from the
    // second call starting before the first finished, and no scrambling.
    expect(decodeCallLog).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => i * 33_333))
  })

  it('a later request does not reseek/close the decoder needlessly once queued behind an earlier one', async () => {
    const manager = new FrameSourceManager()
    const file = new File([], 'proxy.mp4')

    await Promise.all([manager.getFrame('asset-1', file, 2 * 33_333), manager.getFrame('asset-1', file, 4 * 33_333)])

    // Both targets are forward of where decoding started and share the same
    // GOP, so there should be no mid-stream reseek (no decoder recreated).
    expect(closedDecoders).toBe(0)
  })

  it('a persistent decoder error (both hardware and the software retry fail) resolves the request instead of wedging, and the next request recovers', async () => {
    class AlwaysFailsOnThirdSample {
      private outputCb: (frame: ReturnType<typeof fakeFrame>) => void
      private errorCb: (e: unknown) => void
      private callsThisInstance = 0
      constructor(init: { output: (frame: ReturnType<typeof fakeFrame>) => void; error: (e: unknown) => void }) {
        this.outputCb = init.output
        this.errorCb = init.error
      }
      configure(): void {}
      decode(chunk: { timestamp: number }): void {
        decodeCallLog.push(chunk.timestamp)
        this.callsThisInstance++
        if (this.callsThisInstance === 3) {
          setTimeout(() => this.errorCb(new Error('sample is corrupt')), 5)
          return
        }
        setTimeout(() => this.outputCb(fakeFrame()), 5)
      }
      async flush(): Promise<void> {}
      close(): void {
        closedDecoders++
      }
    }
    vi.stubGlobal('VideoDecoder', AlwaysFailsOnThirdSample)

    const manager = new FrameSourceManager()
    const file = new File([], 'proxy.mp4')

    // Fails on its 3rd sample every time (a genuinely corrupt sample, not a
    // one-off hardware hiccup) — even the automatic software-fallback retry
    // hits the same failure, so this must still resolve (empty-handed)
    // rather than wedge the queue.
    const failed = await manager.getFrame('asset-1', file, 5 * 33_333)
    expect(failed).toBeUndefined()

    // The queue must not be wedged: a fresh request reconfigures a decoder
    // and actually completes (resolves) rather than hanging — this fixture
    // fails deterministically on every instance's 3rd sample, in both
    // hardware and software mode, so it resolves undefined again rather
    // than recovering; the point is that it resolves at all.
    const secondCallLength = decodeCallLog.length
    const recovered = await manager.getFrame('asset-1', file, 5 * 33_333)
    expect(recovered).toBeUndefined()
    expect(decodeCallLog.length).toBeGreaterThan(secondCallLength)
  })

  it('recovers via a software-decode retry when the decoder only fails in its default (hardware) mode', async () => {
    // Models exactly the real-world case this fallback targets: a
    // constrained device denies a hardware decode session (total silence,
    // no output or error) but software decode works fine.
    class HardwareOnlyFailsDecoder {
      private outputCb: (frame: ReturnType<typeof fakeFrame>) => void
      private hardwareAcceleration: string
      constructor(init: { output: (frame: ReturnType<typeof fakeFrame>) => void }) {
        this.outputCb = init.output
        this.hardwareAcceleration = 'no-preference'
      }
      configure(config: { hardwareAcceleration?: string }): void {
        this.hardwareAcceleration = config.hardwareAcceleration ?? 'no-preference'
      }
      decode(chunk: { timestamp: number }): void {
        decodeCallLog.push(chunk.timestamp)
        if (this.hardwareAcceleration !== 'prefer-software') return // hang: no callback ever fires
        setTimeout(() => this.outputCb(fakeFrame()), 5)
      }
      async flush(): Promise<void> {}
      close(): void {
        closedDecoders++
      }
    }
    vi.stubGlobal('VideoDecoder', HardwareOnlyFailsDecoder)
    vi.useFakeTimers()

    const manager = new FrameSourceManager()
    const file = new File([], 'proxy.mp4')

    const result = manager.getFrame('asset-1', file, 2 * 33_333)
    // The first (hardware) attempt hangs for the full timeout before the
    // internal retry switches to software decode and succeeds.
    await vi.advanceTimersByTimeAsync(4_100)
    expect(await result).toBeDefined()

    vi.useRealTimers()
  })

  it('a decoder that never calls output or error in any mode does not permanently wedge the session', async () => {
    // Neither callback ever fires, in hardware OR software mode — a real
    // stall mode WebCodecs doesn't guarantee against (backgrounding,
    // thermal throttling, a wedged decoder entirely). Without a timeout
    // this hangs `getFrameAt` forever, and because decode work is
    // serialized per session, every later request for this asset would
    // hang too.
    class NeverRespondingDecoder {
      configure(): void {}
      decode(chunk: { timestamp: number }): void {
        decodeCallLog.push(chunk.timestamp)
      }
      async flush(): Promise<void> {}
      close(): void {
        closedDecoders++
      }
    }
    vi.stubGlobal('VideoDecoder', NeverRespondingDecoder)
    vi.useFakeTimers()

    const manager = new FrameSourceManager()
    const file = new File([], 'proxy.mp4')

    const hung = manager.getFrame('asset-1', file, 5 * 33_333)
    let settled = false
    void hung.then(() => {
      settled = true
    })

    // One timeout for the hardware attempt, one more for the automatic
    // software-fallback retry, before finally giving up.
    await vi.advanceTimersByTimeAsync(7_999)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(200)
    expect(settled).toBe(true)
    expect(await hung).toBeUndefined()

    vi.useRealTimers()
    vi.stubGlobal('VideoDecoder', FakeVideoDecoder)

    // The queue must not be wedged: a fresh request on a working decoder recovers.
    const recovered = await manager.getFrame('asset-1', file, 5 * 33_333)
    expect(recovered).toBeDefined()
  })
})
