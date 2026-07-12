import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { composeFrame } from '#/editor/playback/composeFrame'
import { Compositor } from '#/editor/playback/compositor/gl'
import { FrameSourceManager } from '#/editor/playback/frameSource'
import { projectDurationMicros, type ProjectDoc } from '#/editor/doc/schema'
import type { Micros } from '#/editor/doc/time'
import { readOriginal, readProxy } from '#/editor/media/assetStorage'
import { EXPORT_AUDIO_SAMPLE_RATE, mixdownAudio } from './mixdownAudio'

export interface ExportPreset {
  label: string
  /** Output height in px — width is derived from the project's aspect ratio. */
  height: number
  bitrate: number
}

export const EXPORT_PRESETS: ExportPreset[] = [
  { label: '720p', height: 720, bitrate: 6_000_000 },
  { label: '1080p', height: 1080, bitrate: 10_000_000 },
]

export interface ExportProgress {
  framesEncoded: number
  totalFrames: number
  /** Frames encoded per wall-clock second, smoothed — feeds the ETA estimate. */
  fps: number
}

export interface ExportOptions {
  projectId: string
  doc: ProjectDoc
  preset: ExportPreset
  onProgress?: (progress: ExportProgress) => void
  signal?: AbortSignal
}

export interface ExportResult {
  blob: Blob
  width: number
  height: number
}

const VIDEO_CODEC = 'avc1.640028' // High profile — preferred for quality.
const BASELINE_VIDEO_CODEC = 'avc1.42001f' // Fallback matching the proxy encoder's profile, for devices without High-profile hardware encode.
const KEYFRAME_INTERVAL_SECONDS = 2
const MAX_ENCODE_QUEUE = 4

/** H.264 requires even width/height. */
export function evenDimension(value: number): number {
  return Math.max(2, Math.round(value / 2) * 2)
}

/** Output pixel dimensions for a preset at a project's native aspect ratio. */
export function exportDimensions(doc: Pick<ProjectDoc, 'settings'>, preset: ExportPreset): { width: number; height: number } {
  const scale = preset.height / doc.settings.height
  return { width: evenDimension(doc.settings.width * scale), height: evenDimension(preset.height) }
}

class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled')
    this.name = 'ExportCancelledError'
  }
}

/**
 * Renders a `ProjectDoc` to an MP4 blob: a sequential pull-based loop over
 * project-fps frames, composed with the exact same `composeFrame` logic the
 * live preview uses (so export matches preview by construction), encoded
 * with `VideoEncoder` + `mp4-muxer`. Runs on the main thread rather than in
 * a dedicated worker for now — see Phase 6 notes — but is a pure function of
 * `ProjectDoc`, so where it runs doesn't affect the result.
 *
 * v1 renders from **proxy** media, not originals — `FrameSourceManager` is
 * scoped to baseline-profile (no B-frames) decode, which proxies guarantee
 * and arbitrary user uploads don't. Exporting from originals needs a more
 * general decoder and is follow-up work.
 */
export async function exportProject(options: ExportOptions): Promise<ExportResult> {
  const { projectId, doc, preset, onProgress, signal } = options
  if (signal?.aborted) throw new ExportCancelledError()

  const { width, height } = exportDimensions(doc, preset)
  const fps = doc.settings.fps
  const durationMicros = projectDurationMicros(doc)
  const totalFrames = Math.max(1, Math.round((durationMicros * fps) / 1_000_000))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const compositor = new Compositor(canvas)
  compositor.resize(width, height)

  const frameSources = new FrameSourceManager()
  const proxyFileCache = new Map<string, Promise<File>>()
  const imageBitmapCache = new Map<string, Promise<ImageBitmap>>()
  function getProxyFile(assetId: string): Promise<File> {
    let p = proxyFileCache.get(assetId)
    if (!p) {
      p = readProxy(projectId, assetId)
      proxyFileCache.set(assetId, p)
    }
    return p
  }
  function getImageBitmap(assetId: string): Promise<ImageBitmap> {
    let p = imageBitmapCache.get(assetId)
    if (!p) {
      p = readOriginal(projectId, assetId).then((f) => createImageBitmap(f))
      imageBitmapCache.set(assetId, p)
    }
    return p
  }

  const hasAudio = doc.tracks.some((t) => !t.muted && t.clips.some((c) => c.assetId && !c.muted))
  const audioSupport = hasAudio
    ? await AudioEncoder.isConfigSupported({
        codec: 'mp4a.40.2',
        numberOfChannels: 2,
        sampleRate: EXPORT_AUDIO_SAMPLE_RATE,
        bitrate: 128_000,
      }).catch(() => undefined)
    : undefined

  const muxer = new Muxer({
    target: new ArrayBufferTarget(),
    video: { codec: 'avc', width, height, frameRate: fps },
    audio: audioSupport?.supported
      ? { codec: 'aac', numberOfChannels: 2, sampleRate: EXPORT_AUDIO_SAMPLE_RATE }
      : undefined,
    fastStart: 'in-memory',
  })

  // configure() doesn't reject synchronously for a well-formed but
  // unsupported codec — checking isConfigSupported() up front is what turns
  // that into a clear error instead of encode() silently never producing
  // output (see the same pattern in videoDerivatives.ts).
  const highProfileSupport = await VideoEncoder.isConfigSupported({ codec: VIDEO_CODEC, width, height }).catch(() => undefined)
  const videoCodec = highProfileSupport?.supported ? VIDEO_CODEC : BASELINE_VIDEO_CODEC
  if (!highProfileSupport?.supported) {
    const baselineSupport = await VideoEncoder.isConfigSupported({ codec: BASELINE_VIDEO_CODEC, width, height }).catch(
      () => undefined,
    )
    if (!baselineSupport?.supported) throw new Error(`This device cannot encode H.264 video at ${width}x${height}`)
  }

  let encodeError: unknown
  const videoEncoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      encodeError = e
    },
  })
  videoEncoder.configure({ codec: videoCodec, width, height, bitrate: preset.bitrate, framerate: fps })

  // Best-effort — a multi-minute export shouldn't let the screen lock and
  // starve the encoder of foreground time. Not fatal if unsupported/denied.
  const wakeLock = await navigator.wakeLock?.request('screen').catch(() => undefined)

  try {
    const startedAt = performance.now()
    for (let i = 0; i < totalFrames; i++) {
      if (signal?.aborted) throw new ExportCancelledError()
      if (encodeError) throw encodeError

      const atMicros: Micros = Math.round((i * 1_000_000) / fps)
      await composeFrame(compositor, doc, atMicros, { getProxyFile, getImageBitmap, frameSources })

      while (videoEncoder.encodeQueueSize > MAX_ENCODE_QUEUE) {
        await new Promise((resolve) => setTimeout(resolve, 0))
      }

      const frame = new VideoFrame(canvas, { timestamp: atMicros, duration: Math.round(1_000_000 / fps) })
      const isKeyframe = i % Math.round(fps * KEYFRAME_INTERVAL_SECONDS) === 0
      videoEncoder.encode(frame, { keyFrame: isKeyframe })
      frame.close()

      const elapsedSeconds = (performance.now() - startedAt) / 1000
      onProgress?.({
        framesEncoded: i + 1,
        totalFrames,
        fps: elapsedSeconds > 0 ? (i + 1) / elapsedSeconds : 0,
      })
    }

    await videoEncoder.flush()
    if (encodeError) throw encodeError

    if (hasAudio && audioSupport?.supported) {
      const audioBuffer = await mixdownAudio(doc, (assetId) => readOriginal(projectId, assetId))
      if (audioBuffer) await encodeAudioTrack(audioBuffer, muxer, signal)
    }
  } finally {
    videoEncoder.close()
    frameSources.closeAll()
    compositor.destroy()
    await wakeLock?.release().catch(() => {})
  }

  muxer.finalize()
  return { blob: new Blob([muxer.target.buffer as ArrayBuffer], { type: 'video/mp4' }), width, height }
}

const AUDIO_CHUNK_FRAMES = 4096

async function encodeAudioTrack(
  buffer: AudioBuffer,
  muxer: Muxer<ArrayBufferTarget>,
  signal: AbortSignal | undefined,
): Promise<void> {
  let encodeError: unknown
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (e) => {
      encodeError = e
    },
  })
  encoder.configure({
    codec: 'mp4a.40.2',
    numberOfChannels: 2,
    sampleRate: EXPORT_AUDIO_SAMPLE_RATE,
    bitrate: 128_000,
  })

  const channelData = [buffer.getChannelData(0), buffer.numberOfChannels > 1 ? buffer.getChannelData(1) : buffer.getChannelData(0)]

  for (let start = 0; start < buffer.length; start += AUDIO_CHUNK_FRAMES) {
    if (signal?.aborted) throw new ExportCancelledError()
    if (encodeError) throw encodeError
    const frameCount = Math.min(AUDIO_CHUNK_FRAMES, buffer.length - start)
    const planar = new Float32Array(frameCount * 2)
    planar.set(channelData[0].subarray(start, start + frameCount), 0)
    planar.set(channelData[1].subarray(start, start + frameCount), frameCount)

    const audioData = new AudioData({
      format: 'f32-planar',
      sampleRate: EXPORT_AUDIO_SAMPLE_RATE,
      numberOfChannels: 2,
      numberOfFrames: frameCount,
      timestamp: Math.round((start / EXPORT_AUDIO_SAMPLE_RATE) * 1_000_000),
      data: planar,
    })
    encoder.encode(audioData)
    audioData.close()

    while (encoder.encodeQueueSize > MAX_ENCODE_QUEUE) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  await encoder.flush()
  if (encodeError) throw encodeError
  encoder.close()
}
