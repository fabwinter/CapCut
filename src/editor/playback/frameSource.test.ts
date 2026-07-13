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

  it('a fatal decoder error resolves the request instead of wedging, and the next request recovers', async () => {
    let failuresRemaining = 1
    class FlakyDecoder {
      private outputCb: (frame: ReturnType<typeof fakeFrame>) => void
      private errorCb: (e: unknown) => void
      constructor(init: { output: (frame: ReturnType<typeof fakeFrame>) => void; error: (e: unknown) => void }) {
        this.outputCb = init.output
        this.errorCb = init.error
      }
      configure(): void {}
      decode(chunk: { timestamp: number }): void {
        decodeCallLog.push(chunk.timestamp)
        if (failuresRemaining > 0 && decodeCallLog.length === 3) {
          failuresRemaining--
          setTimeout(() => this.errorCb(new Error('hardware decode failed')), 5)
          return
        }
        setTimeout(() => this.outputCb(fakeFrame()), 5)
      }
      async flush(): Promise<void> {}
      close(): void {
        closedDecoders++
      }
    }
    vi.stubGlobal('VideoDecoder', FlakyDecoder)

    const manager = new FrameSourceManager()
    const file = new File([], 'proxy.mp4')

    // Fails on its 3rd sample — must resolve (empty-handed), never hang.
    const failed = await manager.getFrame('asset-1', file, 5 * 33_333)
    expect(failed).toBeUndefined()

    // The queue must not be wedged: a fresh request reconfigures a decoder,
    // reseeks from the keyframe, and succeeds.
    const recovered = await manager.getFrame('asset-1', file, 5 * 33_333)
    expect(recovered).toBeDefined()
  })
})
