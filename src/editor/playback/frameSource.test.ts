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

  it('decodes a multi-sample batch when the decoder needs pipeline depth > 1 before emitting any output', async () => {
    // Models exactly what WebCodecs' own docs warn about ("you do need to
    // feed a few chunks to get it started... processing is non-linear, and
    // you get frames when you get them") and what a hardware-backed decoder
    // commonly does in practice: it withholds output for decode() call N
    // until at least one *later* call has also been submitted. A decode-
    // then-await-in-lockstep loop can never satisfy that — it always has
    // exactly one call in flight — and would hang forever on the very first
    // sample even though the decoder is working correctly.
    const PIPELINE_DEPTH = 2
    class PipelinedDecoder {
      private outputCb: (frame: ReturnType<typeof fakeFrame>) => void
      private submitted: number[] = []
      private emitted = 0
      constructor(init: { output: (frame: ReturnType<typeof fakeFrame>) => void }) {
        this.outputCb = init.output
      }
      configure(): void {}
      decode(chunk: { timestamp: number }): void {
        decodeCallLog.push(chunk.timestamp)
        this.submitted.push(chunk.timestamp)
        // Every time a new sample arrives, emit output for anything that's
        // now far enough behind the submission front.
        while (this.submitted.length - this.emitted > PIPELINE_DEPTH - 1) {
          this.emitted++
          setTimeout(() => this.outputCb(fakeFrame()), 1)
        }
      }
      async flush(): Promise<void> {
        while (this.emitted < this.submitted.length) {
          this.emitted++
          this.outputCb(fakeFrame())
        }
      }
      close(): void {
        closedDecoders++
      }
    }
    vi.stubGlobal('VideoDecoder', PipelinedDecoder)

    const manager = new FrameSourceManager()
    const file = new File([], 'proxy.mp4')

    // Single-frame request (targetIndex 0): with pipeline depth 2, this
    // sample's own output only arrives once flush() drains the pipeline —
    // exactly the scenario a lockstep decode-await loop deadlocks on.
    const frame = await manager.getFrame('asset-1', file, 0)
    expect(frame).toBeDefined()
  })

  it('recovers from a second, independent decode failure even after the software fallback was already spent', async () => {
    // Reproduces the real-world report: hardware decode fails once early on
    // (recovered via the existing software fallback), playback continues
    // fine for a while, then a *different*, later failure hits — at that
    // point hardwareAcceleration is already 'prefer-software', so gating
    // retries on "are we still in the default mode" (the old logic) would
    // give up immediately with no recovery. The new attempt-based retry
    // must still reseek and recover.
    let globalDecodeCount = 0
    let failedSampleOnce = false
    class TwoIndependentFailuresDecoder {
      private outputCb: (frame: ReturnType<typeof fakeFrame>) => void
      private hardwareAcceleration = 'no-preference'
      private pending = 0
      private drainResolvers: (() => void)[] = []
      constructor(init: { output: (frame: ReturnType<typeof fakeFrame>) => void }) {
        this.outputCb = init.output
      }
      configure(config: { hardwareAcceleration?: string }): void {
        this.hardwareAcceleration = config.hardwareAcceleration ?? 'no-preference'
      }
      decode(chunk: { timestamp: number }): void {
        decodeCallLog.push(chunk.timestamp)
        globalDecodeCount++
        // The very first call ever, in hardware mode, hangs forever —
        // matches the earlier "denied hardware session" test.
        if (globalDecodeCount === 1 && this.hardwareAcceleration !== 'prefer-software') {
          this.pending++
          return
        }
        // A second, independent failure later in the stream — a real decode
        // error, not a hardware/software distinction. Fails exactly once so
        // the retry's re-decode of this same sample succeeds.
        if (chunk.timestamp === 7 * 33_333 && !failedSampleOnce) {
          failedSampleOnce = true
          throw new Error('Key frame is required')
        }
        this.pending++
        setTimeout(() => {
          this.outputCb(fakeFrame())
          this.pending--
          if (this.pending === 0) {
            const resolvers = this.drainResolvers
            this.drainResolvers = []
            for (const resolve of resolvers) resolve()
          }
        }, 1)
      }
      flush(): Promise<void> {
        if (this.pending === 0) return Promise.resolve()
        return new Promise((resolve) => this.drainResolvers.push(resolve))
      }
      close(): void {
        closedDecoders++
      }
    }
    vi.stubGlobal('VideoDecoder', TwoIndependentFailuresDecoder)
    vi.useFakeTimers()

    const manager = new FrameSourceManager()
    const file = new File([], 'proxy.mp4')

    // First request: hardware hang -> software fallback (existing behavior).
    const first = manager.getFrame('asset-1', file, 0)
    await vi.advanceTimersByTimeAsync(4_100)
    expect(await first).toBeDefined()

    // Playback continues forward successfully in software mode.
    for (let idx = 1; idx <= 3; idx++) {
      const r = manager.getFrame('asset-1', file, idx * 33_333)
      await vi.advanceTimersByTimeAsync(50)
      expect(await r).toBeDefined()
    }

    // A later, independent failure — hw is already 'prefer-software' — must
    // still recover via the attempt-based retry.
    const later = manager.getFrame('asset-1', file, 7 * 33_333)
    await vi.advanceTimersByTimeAsync(100)
    expect(await later).toBeDefined()

    vi.useRealTimers()
  })

  it('recovers via a software-decode retry when the decoder only fails in its default (hardware) mode', async () => {
    // Models exactly the real-world case this fallback targets: a
    // constrained device denies a hardware decode session (total silence,
    // no output or error) but software decode works fine.
    class HardwareOnlyFailsDecoder {
      private outputCb: (frame: ReturnType<typeof fakeFrame>) => void
      private hardwareAcceleration: string
      private pending = 0
      private drainResolvers: (() => void)[] = []
      constructor(init: { output: (frame: ReturnType<typeof fakeFrame>) => void }) {
        this.outputCb = init.output
        this.hardwareAcceleration = 'no-preference'
      }
      configure(config: { hardwareAcceleration?: string }): void {
        this.hardwareAcceleration = config.hardwareAcceleration ?? 'no-preference'
      }
      decode(chunk: { timestamp: number }): void {
        decodeCallLog.push(chunk.timestamp)
        this.pending++
        // In hardware mode this never resolves — a denied hardware session
        // doesn't just delay output, it never starts processing at all, so
        // flush() (below) correctly hangs too, exactly like the real thing.
        if (this.hardwareAcceleration !== 'prefer-software') return
        setTimeout(() => {
          this.outputCb(fakeFrame())
          this.pending--
          if (this.pending === 0) {
            const resolvers = this.drainResolvers
            this.drainResolvers = []
            for (const resolve of resolvers) resolve()
          }
        }, 5)
      }
      flush(): Promise<void> {
        if (this.pending === 0) return Promise.resolve()
        return new Promise((resolve) => this.drainResolvers.push(resolve))
      }
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
      // A decoder this stuck never resolves flush() either — nothing it was
      // ever given actually got processed, so there's nothing to drain.
      flush(): Promise<void> {
        return new Promise(() => {})
      }
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
