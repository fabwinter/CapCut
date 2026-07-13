import { demuxVideoTrack, type VideoTrackInfo } from '#/editor/media/demux'

/**
 * Frame-access API for playback and export: `assetId + timestamp -> VideoFrame`.
 *
 * Scoped to **proxy** media (baseline-profile H.264, no B-frames — see
 * `videoDerivatives.ts`), so presentation order equals decode order and a
 * single forward-decoding cursor per asset is sufficient; there's no need
 * for a full random-access frame index. Export (Phase 6) decodes originals,
 * which may need a more general approach and is out of scope here.
 *
 * Every `VideoFrame` handed to a caller is a `.clone()` of an internally
 * cached frame — the cache owns and closes its frames on eviction/session
 * close; callers own and must close whatever they're given.
 */

interface Sample {
  chunk: EncodedVideoChunkInit
  timestampMicros: number
  isKey: boolean
}

/** Rough byte estimate for an RGBA-ish decoded frame — good enough for a cache budget, not exact. */
function estimateFrameBytes(width: number, height: number): number {
  return width * height * 4
}

/**
 * How long to wait for a single decode() to produce an output or error
 * before giving up on it. WebCodecs doesn't guarantee either callback fires
 * for every stall mode a real device can hit (background/backgrounding,
 * thermal throttling, a genuinely wedged hardware decoder) — and because
 * decode work is serialized per session (see `queue`), one hung decode
 * would otherwise block every later request for this asset forever, and by
 * extension freeze the whole render pipeline once render calls are
 * coalesced to "at most one in flight" (see Transport.renderLatest).
 */
const DECODE_TIMEOUT_MS = 4000

class AssetDecoderSession {
  private samples: Sample[] = []
  private trackInfo: VideoTrackInfo | undefined
  private decoder: VideoDecoder | undefined
  private decodedUpToIndex = -1
  private readonly cache = new Map<number, VideoFrame>() // sample index -> frame, insertion order = LRU
  private cacheBytes = 0
  private readonly loaded: Promise<void>
  private pendingOutputs: ((frame: VideoFrame | undefined) => void)[] = []
  /** The actual reason the most recent decode failed, if any — surfaced to the UI so a failure is diagnosable instead of a generic "couldn't decode". */
  private lastFailureMessage: string | undefined
  // Constrained devices cap concurrent *hardware* decode sessions system-wide
  // (not just per-tab) — a decoder that can't get one doesn't error, it just
  // never calls output or error at all, indistinguishable from any other
  // hang until it times out. That's exactly what a hardware-session
  // exhaustion looks like: total silence on the very first decode() call.
  // After a hang, retry once with software decode forced, which sidesteps
  // hardware session limits entirely — proxies are already downscaled
  // specifically so software decode is affordable.
  private hardwareAcceleration: HardwareAcceleration = 'no-preference'
  // Real playback fires a render request every rAF without waiting for the
  // previous one's decode to finish (Transport.tick's `void renderFrameAt`),
  // and decode round-trips on real hardware routinely outlast one frame
  // interval. Without this queue, two overlapping getFrameAt calls would
  // both drive `decoder.decode()` on the same VideoDecoder at once — their
  // calls interleave, `pendingOutputs.shift()` resolves the wrong promise
  // with the wrong frame, and the scrambled decode order breaks the H.264
  // reference-frame chain, producing corrupted blocky output. Every actual
  // decode (cache misses only) is serialized through this chain so only one
  // logical request drives the decoder at a time.
  private queue: Promise<void> = Promise.resolve()

  constructor(
    private readonly file: File,
    private readonly cacheByteBudget: number,
  ) {
    this.loaded = this.load()
  }

  private async load(): Promise<void> {
    await demuxVideoTrack(this.file, {
      onTrackInfo: (info) => {
        this.trackInfo = info
      },
      onSample: (chunk) => {
        this.samples.push({ chunk, timestampMicros: chunk.timestamp, isKey: chunk.type === 'key' })
      },
    })
  }

  private ensureDecoder(): VideoDecoder {
    if (this.decoder) return this.decoder
    const info = this.trackInfo
    if (!info) throw new Error('Track info not loaded')
    const decoder = new VideoDecoder({
      output: (frame) => {
        const cb = this.pendingOutputs.shift()
        if (cb) cb(frame)
        else frame.close()
      },
      error: (e) => {
        // A fatal decoder error would otherwise leave every in-flight
        // getFrameAt waiter pending forever — and since decode work is
        // serialized per session, that would freeze frame delivery for this
        // asset permanently (the canvas just keeps its last drawn frame).
        // Settle all waiters empty-handed and drop the decoder so the next
        // request reconfigures and reseeks from a keyframe.
        this.lastFailureMessage = `decoder error: ${e instanceof Error ? e.message : String(e)} (codec=${info.codec}, ${info.width}x${info.height}, hw=${this.hardwareAcceleration})`
        this.resetAfterFailure()
      },
    })
    try {
      decoder.configure({
        codec: info.codec,
        codedWidth: info.width,
        codedHeight: info.height,
        description: info.description,
        hardwareAcceleration: this.hardwareAcceleration,
      })
    } catch (e) {
      this.lastFailureMessage = `configure() rejected: ${e instanceof Error ? e.message : String(e)} (codec=${info.codec}, ${info.width}x${info.height}, hw=${this.hardwareAcceleration})`
      throw e
    }
    this.decoder = decoder
    return decoder
  }

  /** The actual reason the most recent decode failed — see `lastFailureMessage`. */
  getLastFailureMessage(): string | undefined {
    return this.lastFailureMessage
  }

  /**
   * Called after `resetAfterFailure()` on any decode failure. Retries once
   * per `decodeTo` call (via `attempt`), escalating to software decode on
   * that retry if we hadn't already — independent of whatever hardware
   * mode a *previous*, unrelated `decodeTo` call left the session in, so a
   * later failure always gets its own chance to recover instead of only
   * ever the first one in the session.
   */
  private retryAfterFailure(targetIndex: number, attempt: number): Promise<VideoFrame | undefined> | undefined {
    if (attempt > 0) return undefined
    if (this.hardwareAcceleration === 'no-preference') this.hardwareAcceleration = 'prefer-software'
    return this.decodeTo(targetIndex, attempt + 1)
  }

  /** Settles every pending waiter empty-handed and drops the decoder so the next request reconfigures and reseeks from a keyframe. Shared by the decoder's fatal-error callback and a stalled-decode timeout. */
  private resetAfterFailure(): void {
    const pending = this.pendingOutputs
    this.pendingOutputs = []
    for (const cb of pending) cb(undefined)
    try {
      this.decoder?.close()
    } catch {
      // Already closed by the UA, or by the error that triggered this reset.
    }
    this.decoder = undefined
    this.decodedUpToIndex = -1
  }

  private findSampleIndex(timestampMicros: number): number {
    // Last sample whose timestamp is <= target (samples are presentation-ordered for baseline H.264).
    let lo = 0
    let hi = this.samples.length - 1
    let result = 0
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (this.samples[mid].timestampMicros <= timestampMicros) {
        result = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return result
  }

  private nearestKeyframeIndex(targetIndex: number): number {
    for (let i = targetIndex; i >= 0; i--) {
      if (this.samples[i].isKey) return i
    }
    return 0
  }

  private cacheFrame(index: number, frame: VideoFrame): void {
    const bytes = estimateFrameBytes(frame.codedWidth, frame.codedHeight)
    this.cache.set(index, frame)
    this.cacheBytes += bytes
    while (this.cacheBytes > this.cacheByteBudget && this.cache.size > 1) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey === undefined || oldestKey === index) break
      const oldest = this.cache.get(oldestKey)
      if (oldest) {
        this.cacheBytes -= estimateFrameBytes(oldest.codedWidth, oldest.codedHeight)
        oldest.close()
      }
      this.cache.delete(oldestKey)
    }
  }

  private touch(index: number, frame: VideoFrame): void {
    this.cache.delete(index)
    this.cache.set(index, frame)
  }

  async getFrameAt(timestampMicros: number, isStale?: () => boolean): Promise<VideoFrame | undefined> {
    await this.loaded
    if (this.samples.length === 0) return undefined
    const targetIndex = this.findSampleIndex(timestampMicros)

    const cached = this.cache.get(targetIndex)
    if (cached) {
      this.touch(targetIndex, cached)
      return cached.clone()
    }

    // Queue behind whatever decode is currently in flight — see the `queue`
    // field comment for why concurrent decode loops on one VideoDecoder
    // corrupt output. `.catch` keeps one failed request from wedging the
    // chain for whoever queues up behind it. Re-check staleness once our
    // turn actually comes up: a fast-ticking playback loop can queue several
    // requests before any of them run, and there's no point decoding frames
    // for a render call that's already been superseded.
    const turn = this.queue.then(() => (isStale?.() ? undefined : this.decodeTo(targetIndex)))
    this.queue = turn.then(
      () => undefined,
      () => undefined,
    )
    return turn
  }

  /**
   * Decodes forward to `targetIndex`, reseeking to the nearest keyframe
   * first if necessary. Only ever called with one call in flight at a time
   * — see `queue`.
   *
   * `attempt` bounds recovery retries (reseek-from-keyframe, and — on the
   * first attempt only — a hardware→software decode fallback) to one retry
   * per call, independent of `hardwareAcceleration`'s sticky session-wide
   * state. Gating retries solely on "are we still in the default hardware
   * mode" meant only the *first* failure in a session ever got a second
   * chance — once the software fallback had already been spent recovering
   * from an earlier hiccup, every later failure (a real one can happen more
   * than once over a long playback session) killed the decoder outright
   * with no recourse, even though a plain reseek-and-retry (no mode change
   * needed) might well have recovered it.
   */
  private async decodeTo(targetIndex: number, attempt = 0): Promise<VideoFrame | undefined> {
    // A queued call ahead of us may have already decoded (and cached) this
    // exact frame by the time our turn comes up.
    const cached = this.cache.get(targetIndex)
    if (cached) {
      this.touch(targetIndex, cached)
      return cached.clone()
    }

    // Decode forward from the nearest keyframe if we haven't already passed
    // it; otherwise a plain forward-advance from where we left off is enough.
    const keyframeIndex = this.nearestKeyframeIndex(targetIndex)
    const needsReseek = this.decodedUpToIndex < keyframeIndex - 1 || targetIndex < this.decodedUpToIndex
    const decoder = this.ensureDecoder()
    let startIndex: number
    if (needsReseek) {
      await decoder.flush().catch(() => {})
      decoder.close()
      this.decoder = undefined
      startIndex = keyframeIndex
    } else {
      startIndex = this.decodedUpToIndex + 1
    }
    const activeDecoder = this.ensureDecoder()

    // Submit every sample the batch needs *before* awaiting any output —
    // decoding one sample and awaiting its output before submitting the
    // next assumes zero pipeline depth, which real decoders don't
    // guarantee. Per WebCodecs' own guidance: "you do need to feed a few
    // chunks to get it started... you get frames when you get them" — a
    // decoder (particularly hardware-backed) can need more than one sample
    // queued before it emits its *first* output at all. Decode-then-await
    // in lockstep starves that pipeline and can hang forever on sample 0
    // even though the decoder is working perfectly, just waiting for more
    // input it will never receive.
    const framePromises: Promise<VideoFrame | undefined>[] = []
    for (let i = startIndex; i <= targetIndex; i++) {
      const framePromise = new Promise<VideoFrame | undefined>((resolve) => {
        this.pendingOutputs.push(resolve)
      })
      framePromises.push(framePromise)
      try {
        activeDecoder.decode(new EncodedVideoChunk(this.samples[i].chunk))
      } catch (e) {
        this.lastFailureMessage = `decode() threw on sample ${i}/${this.samples.length - 1}: ${e instanceof Error ? e.message : String(e)} (hw=${this.hardwareAcceleration}, attempt=${attempt})`
        this.resetAfterFailure()
        return await this.retryAfterFailure(targetIndex, attempt)
      }
    }

    // Even submitting the whole batch up front isn't enough on its own: the
    // *last* sample in the batch can still be stuck behind the decoder's
    // pipeline depth with nothing further queued to flush it out. flush()
    // is the one WebCodecs operation guaranteed to resolve only once every
    // decode() call submitted so far has produced its output (or been
    // discarded) — so it's the actual termination guarantee here, not the
    // batch submission by itself. The batch submission still matters: it's
    // what lets the decoder's pipeline fill up enough to produce *any*
    // output before flush forces the rest out.
    const hwMode = this.hardwareAcceleration
    const flushTimedOut = Symbol('flush-timeout')
    const flushResult = await Promise.race([
      activeDecoder.flush().then(
        () => true as const,
        () => false as const,
      ),
      new Promise<typeof flushTimedOut>((resolve) => setTimeout(() => resolve(flushTimedOut), DECODE_TIMEOUT_MS)),
    ])
    if (flushResult !== true) {
      this.lastFailureMessage = `decoder.flush() ${flushResult === false ? 'rejected' : `timed out after ${DECODE_TIMEOUT_MS}ms`} draining batch (samples ${startIndex}-${targetIndex}/${this.samples.length - 1}, hw=${hwMode}, attempt=${attempt})`
      this.resetAfterFailure()
      // A decoder that can't even drain what it was given is a classic
      // signature of a hardware decode session the OS wouldn't grant —
      // constrained devices cap concurrent hardware decode sessions
      // system-wide, not just per tab, and a denied session doesn't error,
      // it just never responds. Software decode sidesteps that limit
      // entirely, and proxies are downscaled specifically so software
      // decode is affordable — worth one transparent retry before
      // surfacing a failure.
      return await this.retryAfterFailure(targetIndex, attempt)
    }

    // Every output for this batch should have arrived by now (or the
    // decoder hit a fatal error, which resetAfterFailure would have already
    // settled these promises with `undefined` for). Still race each one
    // against a short grace-period timeout as a safety net — flush()
    // resolving is supposed to guarantee this, but shouldn't be trusted
    // blindly against a non-compliant implementation with no fallback.
    const DRAIN_GRACE_MS = 500
    let targetFrame: VideoFrame | undefined
    for (let idx = 0; idx < framePromises.length; idx++) {
      const i = startIndex + idx
      const drainTimedOut = Symbol('drain-timeout')
      const drained = await Promise.race([
        framePromises[idx],
        new Promise<typeof drainTimedOut>((resolve) => setTimeout(() => resolve(drainTimedOut), DRAIN_GRACE_MS)),
      ])
      if (drained === drainTimedOut) {
        this.lastFailureMessage = `flush() resolved but sample ${i}/${this.samples.length - 1} never arrived within ${DRAIN_GRACE_MS}ms after (hw=${hwMode}, attempt=${attempt})`
        this.resetAfterFailure()
        return await this.retryAfterFailure(targetIndex, attempt)
      }
      const frame = drained
      // undefined here means the decoder's error callback already fired (it
      // settles pendingOutputs itself) and called resetAfterFailure — no
      // need to call it again.
      if (!frame) {
        return await this.retryAfterFailure(targetIndex, attempt)
      }
      this.decodedUpToIndex = i
      if (i === targetIndex) {
        targetFrame = frame
        this.cacheFrame(i, frame)
      } else {
        frame.close()
      }
    }
    return targetFrame?.clone()
  }

  close(): void {
    for (const frame of this.cache.values()) frame.close()
    this.cache.clear()
    this.cacheBytes = 0
    this.decoder?.close()
    this.decoder = undefined
    this.decodedUpToIndex = -1
  }
}

const DEFAULT_MAX_SESSIONS = 2
const DEFAULT_CACHE_BYTES_PER_ASSET = 32 * 1024 * 1024

/**
 * Owns a bounded pool of `AssetDecoderSession`s (memory is the scarcest
 * resource on iPad — see ARCHITECTURE §2.1) — at most `maxSessions` assets
 * have an open decoder at once, least-recently-used evicted first.
 */
export class FrameSourceManager {
  private readonly sessions = new Map<string, AssetDecoderSession>()

  constructor(
    private readonly maxSessions = DEFAULT_MAX_SESSIONS,
    private readonly cacheByteBudgetPerAsset = DEFAULT_CACHE_BYTES_PER_ASSET,
  ) {}

  async getFrame(assetId: string, file: File, timestampMicros: number, isStale?: () => boolean): Promise<VideoFrame | undefined> {
    let session = this.sessions.get(assetId)
    if (session) {
      // Re-insert to mark most-recently-used (Map preserves insertion order).
      this.sessions.delete(assetId)
      this.sessions.set(assetId, session)
    } else {
      if (this.sessions.size >= this.maxSessions) {
        const lruId = this.sessions.keys().next().value
        if (lruId !== undefined) {
          this.sessions.get(lruId)?.close()
          this.sessions.delete(lruId)
        }
      }
      session = new AssetDecoderSession(file, this.cacheByteBudgetPerAsset)
      this.sessions.set(assetId, session)
    }
    return session.getFrameAt(timestampMicros, isStale)
  }

  /** The actual reason `getFrame` most recently returned undefined for `assetId` — see `AssetDecoderSession.lastFailureMessage`. */
  getLastFailureMessage(assetId: string): string | undefined {
    return this.sessions.get(assetId)?.getLastFailureMessage()
  }

  closeAll(): void {
    for (const session of this.sessions.values()) session.close()
    this.sessions.clear()
  }
}
