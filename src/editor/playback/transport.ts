import { findActiveClips } from '#/editor/doc/selectors/activeClips'
import { projectDurationMicros, type ProjectDoc, type Transform } from '#/editor/doc/schema'
import type { Micros } from '#/editor/doc/time'
import { readOriginal, readProxy } from '#/editor/media/assetStorage'
import { Compositor } from './compositor/gl'
import { computeTextAnimationModifier } from './compositor/textAnimation'
import { rasterizeText } from './compositor/textRasterizer'
import { computeQuadCorners } from './compositor/transform2d'
import { FrameSourceManager } from './frameSource'

function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return [0, 0, 0]
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
}

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
   * repeatedly during a fast scrub should discard stale in-flight calls
   * themselves — this only guards against out-of-order completion clobbering
   * a newer frame with an older one.
   */
  async renderFrameAt(atMicros: Micros): Promise<void> {
    const generation = ++this.renderGeneration
    const doc = this.getDoc()
    this.ensureCanvasSize(doc)
    const [r, g, b] = hexToRgb01(doc.settings.background)

    const active = findActiveClips(doc, atMicros)
    const framesToClose: VideoFrame[] = []
    const draws: { slotKey: string; source: TexImageSource; quad: ReturnType<typeof computeQuadCorners>; opacity: number }[] =
      []

    for (const { clip, track, clipLocalMicros, localMicros } of active) {
      if (track.kind === 'audio') continue
      try {
        const override = this.transformOverrides.get(clip.id)
        const transform = override ? { ...clip.transform, ...override } : clip.transform

        if (clip.text) {
          const raster = rasterizeText(clip.text, doc.settings.width, doc.settings.height)
          const mod = computeTextAnimationModifier(
            clip.text.animationIn,
            clip.text.animationOut,
            clipLocalMicros,
            clip.durationMicros,
            doc.settings.width,
          )
          const quad = computeQuadCorners(
            { ...transform, x: transform.x + mod.xOffsetPx, scale: transform.scale * mod.scaleMul },
            doc.settings.width,
            doc.settings.height,
            doc.settings.width,
            doc.settings.height,
          )
          draws.push({ slotKey: clip.id, source: raster, quad, opacity: transform.opacity * mod.opacityMul })
          continue
        }
        if (!clip.assetId) continue
        const asset = doc.assets.find((a) => a.id === clip.assetId)
        if (!asset || asset.status !== 'ready') continue

        if (asset.kind === 'image') {
          const bitmap = await this.getImageBitmap(asset.id)
          if (generation !== this.renderGeneration) return
          const quad = computeQuadCorners(transform, bitmap.width, bitmap.height, doc.settings.width, doc.settings.height)
          draws.push({ slotKey: clip.id, source: bitmap, quad, opacity: transform.opacity })
        } else if (asset.kind === 'video' && asset.proxy) {
          const file = await this.getProxyFile(asset.id)
          const frame = await this.frameSources.getFrame(asset.id, file, localMicros)
          if (generation !== this.renderGeneration) {
            frame?.close()
            return
          }
          if (!frame) continue
          framesToClose.push(frame)
          const quad = computeQuadCorners(transform, frame.codedWidth, frame.codedHeight, doc.settings.width, doc.settings.height)
          draws.push({ slotKey: clip.id, source: frame, quad, opacity: transform.opacity })
        }
      } catch (err) {
        console.error('Failed to render clip', clip.id, err)
      }
    }

    if (generation !== this.renderGeneration) {
      for (const frame of framesToClose) frame.close()
      return
    }

    this.compositor.clear(r, g, b, 1)
    for (const draw of draws) this.compositor.drawLayer(draw.slotKey, draw.source, draw.quad, draw.opacity)
    for (const frame of framesToClose) frame.close()
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

  private async scheduleAudio(fromMicros: Micros): Promise<void> {
    const ctx = this.ensureAudioContext()
    const active = findActiveClips(this.getDoc(), fromMicros)
    for (const { clip, track, clipLocalMicros } of active) {
      if (clip.muted || track.muted || track.kind === 'text') continue
      const asset = this.getDoc().assets.find((a) => a.id === clip.assetId)
      if (!asset || (asset.kind !== 'audio' && asset.kind !== 'video')) continue

      const buffer = await this.getAudioBuffer(asset.id)
      if (!buffer || !this.playing) continue

      const offsetSeconds = Math.min(
        buffer.duration,
        Math.max(0, (clip.inPointMicros + clipLocalMicros * clip.speed) / 1_000_000),
      )
      const remainingSeconds = Math.max(0, (clip.durationMicros - clipLocalMicros) / (1_000_000 * clip.speed))
      const playableSeconds = Math.min(remainingSeconds, (buffer.duration - offsetSeconds) / clip.speed)
      if (playableSeconds <= 0) continue

      const source = ctx.createBufferSource()
      source.buffer = buffer
      source.playbackRate.value = clip.speed
      const gain = ctx.createGain()
      gain.gain.value = clip.volume
      source.connect(gain).connect(this.masterGain!)
      source.start(this.playStartCtxTime, offsetSeconds, playableSeconds * clip.speed)
      this.activeAudioSources.push(source)
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
      void this.renderFrameAt(duration)
      return
    }
    this.callbacks.onTick?.(micros)
    void this.renderFrameAt(micros)
    this.rafHandle = requestAnimationFrame(() => this.tick())
  }

  destroy(): void {
    this.pause()
    this.frameSources.closeAll()
    this.compositor.destroy()
    this.audioContext?.close().catch(() => {})
  }
}
