import { projectDurationMicros, type ProjectDoc, type Transform } from '#/editor/doc/schema'
import type { Micros } from '#/editor/doc/time'
import { readOriginal, readProxy } from '#/editor/media/assetStorage'
import { computeGainEnvelope } from './audioEnvelope'
import { coalesceLatest } from './coalesceLatest'
import { composeFrame } from './composeFrame'
import { Compositor } from './compositor/gl'
import { FrameSourceManager } from './frameSource'

export interface TransportCallbacks {
  onTick?: (micros: Micros) => void
  onPlayStateChange?: (playing: boolean) => void
}

/**
 * Owns preview playback: the WebGL2 compositor, an `AudioContext`-clocked
 * transport (audio is the master clock — video chases it, per
 * ARCHITECTURE §4.3), and single-frame renders for paused edits. One
 * instance lives per open editor; `destroy()` releases every GPU/decoder
 * resource it holds.
 */
export class Transport {
  private readonly compositor: Compositor
  private readonly frameSources = new FrameSourceManager()
  private readonly proxyFileCache = new Map<string, Promise<File>>()
  private readonly originalFileCache = new Map<string, Promise<File>>()
  private readonly imageBitmapCache = new Map<string, Promise<ImageBitmap>>()
  private readonly audioBufferCache = new Map<string, Promise<AudioBuffer | undefined>>()
  private audioContext: AudioContext | undefined
  private masterGain: GainNode | undefined
  private activeAudioSources: AudioBufferSourceNode[] = []
  private playing = false
  private playStartCtxTime = 0
  private playStartMicros = 0
  private rafHandle: number | undefined
  // Guards against a livelock: without it, tick() firing a new renderFrameAt
  // every rAF regardless of whether the previous one finished means that on
  // real hardware — where a video decode takes longer than one frame
  // interval — every call is superseded (isStale) by the time its decode
  // completes, so composeFrame discards the frame before ever drawing it.
  // Forever. Coalescing to "at most one render in flight, always for the
  // freshest playhead position" trades video frame rate for decode
  // throughput instead of livelocking; audio (the master clock) is
  // unaffected either way.
  private readonly renderLatest = coalesceLatest((micros: Micros) => this.renderFrameAt(micros))
  private lastCanvasSize = { width: 0, height: 0 }
  private renderGeneration = 0
  /** Live drag/pinch preview for a clip's transform, layered on top of the doc without touching it — see `setTransformOverride`. */
  private readonly transformOverrides = new Map<string, Partial<Transform>>()

  constructor(
    private readonly projectId: string,
    private readonly getDoc: () => ProjectDoc,
    canvas: HTMLCanvasElement,
    private readonly callbacks: TransportCallbacks = {},
  ) {
    this.compositor = new Compositor(canvas)
  }

  get isPlaying(): boolean {
    return this.playing
  }

  private ensureCanvasSize(doc: ProjectDoc): void {
    if (this.lastCanvasSize.width === doc.settings.width && this.lastCanvasSize.height === doc.settings.height) return
    this.compositor.resize(doc.settings.width, doc.settings.height)
    this.lastCanvasSize = { width: doc.settings.width, height: doc.settings.height }
  }

  private getProxyFile(assetId: string): Promise<File> {
    let p = this.proxyFileCache.get(assetId)
    if (!p) {
      p = readProxy(this.projectId, assetId)
      this.proxyFileCache.set(assetId, p)
    }
    return p
  }

  private getOriginalFile(assetId: string): Promise<File> {
    let p = this.originalFileCache.get(assetId)
    if (!p) {
      p = readOriginal(this.projectId, assetId)
      this.originalFileCache.set(assetId, p)
    }
    return p
  }

  private getImageBitmap(assetId: string): Promise<ImageBitmap> {
    let p = this.imageBitmapCache.get(assetId)
    if (!p) {
      p = this.getOriginalFile(assetId).then((f) => createImageBitmap(f))
      this.imageBitmapCache.set(assetId, p)
    }
    return p
  }

  /**
   * Composes and draws a single frame at `atMicros`. Callers that fire this
   * repeatedly during a fast scrub race against each other - composeFrame
   * checks isStale after every await and bails without touching the canvas
   * once a newer call has superseded this one.
   */
  async renderFrameAt(atMicros: Micros): Promise<void> {
    const generation = ++this.renderGeneration
    const doc = this.getDoc()
    this.ensureCanvasSize(doc)
    await composeFrame(this.compositor, doc, atMicros, {
      getProxyFile: (assetId) => this.getProxyFile(assetId),
      getImageBitmap: (assetId) => this.getImageBitmap(assetId),
      frameSources: this.frameSources,
      transformOverrides: this.transformOverrides,
      isStale: () => generation !== this.renderGeneration,
    })
  }

  /** Sets or clears a live transform preview for `clipId`, applied on top of the doc until cleared. */
  setTransformOverride(clipId: string, patch: Partial<Transform> | null): void {
    if (patch) this.transformOverrides.set(clipId, patch)
    else this.transformOverrides.delete(clipId)
  }

  // --- Playback (AudioContext-clocked) ---

  private ensureAudioContext(): AudioContext {
    if (!this.audioContext) {
      this.audioContext = new AudioContext()
      this.masterGain = this.audioContext.createGain()
      this.masterGain.connect(this.audioContext.destination)
    }
    return this.audioContext
  }

  private async getAudioBuffer(assetId: string): Promise<AudioBuffer | undefined> {
    let p = this.audioBufferCache.get(assetId)
    if (!p) {
      p = this.getOriginalFile(assetId)
        .then((file) => file.arrayBuffer())
        .then((buf) => this.ensureAudioContext().decodeAudioData(buf))
        .catch(() => undefined)
      this.audioBufferCache.set(assetId, p)
    }
    return p
  }

  private stopAudio(): void {
    for (const src of this.activeAudioSources) {
      try {
        src.stop()
      } catch {
        // already stopped
      }
      src.disconnect()
    }
    this.activeAudioSources = []
  }

  /**
   * Schedules every clip from `fromMicros` to the end of the project, not
   * just whatever's active right now — a clip that starts later in this
   * playback still needs its `AudioBufferSourceNode.start()` call queued up
   * front, since Web Audio scheduling is not something you can append to
   * mid-playback without introducing a gap.
   */
  private async scheduleAudio(fromMicros: Micros): Promise<void> {
    const ctx = this.ensureAudioContext()
    const doc = this.getDoc()
    for (const track of doc.tracks) {
      if (track.muted || track.kind === 'text') continue
      for (const clip of track.clips) {
        if (clip.muted) continue
        const clipEndMicros = clip.startMicros + clip.durationMicros
        if (clipEndMicros <= fromMicros) continue

        const asset = doc.assets.find((a) => a.id === clip.assetId)
        if (!asset || (asset.kind !== 'audio' && asset.kind !== 'video')) continue
        const buffer = await this.getAudioBuffer(asset.id)
        if (!buffer || !this.playing) continue

        // How far into the clip's own timeline this source starts (0 unless
        // the clip was already playing when playback began).
        const clipLocalStartMicros = Math.max(0, fromMicros - clip.startMicros)
        const whenSeconds = this.playStartCtxTime + Math.max(0, clip.startMicros - fromMicros) / 1_000_000

        const sourceOffsetSeconds = Math.min(
          buffer.duration,
          Math.max(0, (clip.inPointMicros + clipLocalStartMicros * clip.speed) / 1_000_000),
        )
        const sourceRemainingSeconds = ((clip.durationMicros - clipLocalStartMicros) * clip.speed) / 1_000_000
        const playableSourceSeconds = Math.min(sourceRemainingSeconds, buffer.duration - sourceOffsetSeconds)
        if (playableSourceSeconds <= 0) continue

        const source = ctx.createBufferSource()
        source.buffer = buffer
        source.playbackRate.value = clip.speed
        const gain = ctx.createGain()
        const envelope = computeGainEnvelope(clip, clipLocalStartMicros)
        const base = Math.max(whenSeconds, ctx.currentTime)
        gain.gain.cancelScheduledValues(base)
        for (const point of envelope) {
          if (point.ramp) gain.gain.linearRampToValueAtTime(point.value, base + point.atSeconds)
          else gain.gain.setValueAtTime(point.value, base + point.atSeconds)
        }
        source.connect(gain).connect(this.masterGain!)
        source.start(whenSeconds, sourceOffsetSeconds, playableSourceSeconds)
        this.activeAudioSources.push(source)
      }
    }
  }

  async play(fromMicros: Micros): Promise<void> {
    if (this.playing) return
    this.playing = true
    const ctx = this.ensureAudioContext()
    if (ctx.state === 'suspended') await ctx.resume()
    this.playStartCtxTime = ctx.currentTime
    this.playStartMicros = fromMicros
    await this.scheduleAudio(fromMicros)
    this.callbacks.onPlayStateChange?.(true)
    this.tick()
  }

  pause(): void {
    if (!this.playing) return
    this.playing = false
    this.stopAudio()
    if (this.rafHandle !== undefined) cancelAnimationFrame(this.rafHandle)
    this.rafHandle = undefined
    this.callbacks.onPlayStateChange?.(false)
  }

  /** Current playhead position — the audio clock while playing, the last-set position while paused. */
  currentMicros(): Micros {
    if (!this.playing || !this.audioContext) return this.playStartMicros
    const elapsedSeconds = this.audioContext.currentTime - this.playStartCtxTime
    return this.playStartMicros + Math.round(elapsedSeconds * 1_000_000)
  }

  private tick(): void {
    if (!this.playing) return
    const micros = this.currentMicros()
    const duration = projectDurationMicros(this.getDoc())
    if (micros >= duration) {
      this.pause()
      this.callbacks.onTick?.(duration)
      this.renderLatest(duration)
      return
    }
    this.callbacks.onTick?.(micros)
    this.renderLatest(micros)
    this.rafHandle = requestAnimationFrame(() => this.tick())
  }

  destroy(): void {
    this.pause()
    this.frameSources.closeAll()
    this.compositor.destroy()
    this.audioContext?.close().catch(() => {})
  }
}
