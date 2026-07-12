/// <reference lib="webworker" />
import { ArrayBufferTarget, Muxer } from 'mp4-muxer'
import { demuxVideoTrack, probeContainer, type VideoTrackInfo } from './demux'

export interface VideoDerivativesOptions {
  /** Longest edge of the generated proxy, in pixels. */
  proxyMaxDimension: number
  /** Longest edge of generated thumbnails, in pixels. */
  thumbnailMaxDimension: number
  /** Roughly one thumbnail every N seconds of source. */
  thumbnailIntervalSeconds: number
  proxyBitrate: number
  /** Codec string for the proxy encoder — H.264 baseline in production; overridable for environments without H.264 hardware. */
  proxyCodec: string
}

export const DEFAULT_VIDEO_DERIVATIVES_OPTIONS: VideoDerivativesOptions = {
  proxyMaxDimension: 960,
  thumbnailMaxDimension: 160,
  thumbnailIntervalSeconds: 1,
  proxyBitrate: 2_000_000,
  proxyCodec: 'avc1.42001f',
}

export interface VideoDerivativesResult {
  proxy: { blob: Blob; width: number; height: number }
  thumbnails: Blob[]
  thumbnailIntervalMicros: number
  sourceInfo: VideoTrackInfo
}

function scaledDimensions(width: number, height: number, maxDimension: number): { width: number; height: number } {
  const scale = Math.min(1, maxDimension / Math.max(width, height))
  // H.264 requires even dimensions.
  const w = Math.max(2, Math.round((width * scale) / 2) * 2)
  const h = Math.max(2, Math.round((height * scale) / 2) * 2)
  return { width: w, height: h }
}

/**
 * Single decode pass over the source video that produces both a downscaled
 * proxy (for editing preview) and a sparse thumbnail strip (for the
 * timeline), so the source is only decoded once.
 */
/**
 * WebCodecs' `configure()` does not reject synchronously for a well-formed
 * but *unsupported* codec — the failure only ever surfaces via the decoder's
 * `error` callback, which some browsers never fire if nothing was ever
 * successfully queued. Left unchecked, that means `decoder.flush()` below
 * can hang forever instead of failing. Checking `isConfigSupported()` first
 * turns that into a fast, clear error.
 */
async function assertCodecsSupported(
  info: { videoCodec?: string; width?: number; height?: number; fps?: number },
  options: VideoDerivativesOptions,
): Promise<void> {
  if (!info.videoCodec || !info.width || !info.height) throw new Error('No video track found')

  const [decodeSupport, encodeSupport] = await Promise.all([
    VideoDecoder.isConfigSupported({
      codec: info.videoCodec,
      codedWidth: info.width,
      codedHeight: info.height,
    }),
    VideoEncoder.isConfigSupported({
      codec: options.proxyCodec,
      width: info.width,
      height: info.height,
      bitrate: options.proxyBitrate,
      framerate: info.fps ?? 30,
    }),
  ])
  if (!decodeSupport.supported) {
    throw new Error(`This device cannot decode video codec "${info.videoCodec}"`)
  }
  if (!encodeSupport.supported) {
    throw new Error(`This device cannot encode proxy codec "${options.proxyCodec}"`)
  }
}

export async function generateVideoDerivatives(
  file: File,
  options: VideoDerivativesOptions = DEFAULT_VIDEO_DERIVATIVES_OPTIONS,
): Promise<VideoDerivativesResult> {
  const containerInfo = await probeContainer(file)
  await assertCodecsSupported(containerInfo, options)

  let decoder: VideoDecoder
  let encoder: VideoEncoder
  let muxer: Muxer<ArrayBufferTarget>
  let proxyCtx: OffscreenCanvasRenderingContext2D
  let thumbCtx: OffscreenCanvasRenderingContext2D
  let proxyDims: { width: number; height: number }
  let thumbDims: { width: number; height: number }
  let sourceInfo: VideoTrackInfo

  const thumbnails: Blob[] = []
  const thumbnailPromises: Promise<void>[] = []
  const thumbnailIntervalMicros = options.thumbnailIntervalSeconds * 1_000_000
  let nextThumbnailAt = 0
  let pipelineError: unknown

  await demuxVideoTrack(file, {
    onTrackInfo: (info) => {
      sourceInfo = info
      proxyDims = scaledDimensions(info.width, info.height, options.proxyMaxDimension)
      thumbDims = scaledDimensions(info.width, info.height, options.thumbnailMaxDimension)

      const proxyCanvas = new OffscreenCanvas(proxyDims.width, proxyDims.height)
      const ctx = proxyCanvas.getContext('2d')
      if (!ctx) throw new Error('2D canvas context unavailable')
      proxyCtx = ctx

      const thumbCanvas = new OffscreenCanvas(thumbDims.width, thumbDims.height)
      const tctx = thumbCanvas.getContext('2d')
      if (!tctx) throw new Error('2D canvas context unavailable')
      thumbCtx = tctx

      muxer = new Muxer({
        target: new ArrayBufferTarget(),
        video: { codec: 'avc', width: proxyDims.width, height: proxyDims.height },
        fastStart: 'in-memory',
      })

      encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
        error: (e) => {
          pipelineError = e
        },
      })
      encoder.configure({
        codec: options.proxyCodec,
        width: proxyDims.width,
        height: proxyDims.height,
        bitrate: options.proxyBitrate,
        framerate: info.fps ?? 30,
      })

      decoder = new VideoDecoder({
        output: (frame) => {
          try {
            proxyCtx.drawImage(frame, 0, 0, proxyDims.width, proxyDims.height)
            const scaledFrame = new VideoFrame(proxyCanvas, {
              timestamp: frame.timestamp,
              duration: frame.duration ?? undefined,
            })
            encoder.encode(scaledFrame)
            scaledFrame.close()

            if (frame.timestamp >= nextThumbnailAt) {
              thumbCtx.drawImage(frame, 0, 0, thumbDims.width, thumbDims.height)
              const index = thumbnails.length
              thumbnails.push(new Blob())
              thumbnailPromises.push(
                thumbCanvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 }).then((blob) => {
                  thumbnails[index] = blob
                }),
              )
              nextThumbnailAt += thumbnailIntervalMicros
            }
          } catch (e) {
            pipelineError = e
          } finally {
            frame.close()
          }
        },
        error: (e) => {
          pipelineError = e
        },
      })
      decoder.configure({
        codec: info.codec,
        codedWidth: info.width,
        codedHeight: info.height,
        description: info.description,
      })
    },
    onSample: (chunk) => {
      if (pipelineError) return
      try {
        decoder.decode(new EncodedVideoChunk(chunk))
      } catch (e) {
        pipelineError = e
      }
    },
  })

  await decoder!.flush()
  decoder!.close()
  await encoder!.flush()
  encoder!.close()
  await Promise.all(thumbnailPromises)

  if (pipelineError) throw pipelineError instanceof Error ? pipelineError : new Error(String(pipelineError))

  muxer!.finalize()

  return {
    proxy: {
      blob: new Blob([muxer!.target.buffer as ArrayBuffer], { type: 'video/mp4' }),
      width: proxyDims!.width,
      height: proxyDims!.height,
    },
    thumbnails,
    thumbnailIntervalMicros,
    sourceInfo: sourceInfo!,
  }
}
