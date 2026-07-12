import { createFile, DataStream, Endianness, MP4BoxBuffer, type ISOFile, type Movie, type Track } from 'mp4box'

export interface VideoTrackInfo {
  id: number
  codec: string
  width: number
  height: number
  durationMicros: number
  fps?: number
  description?: Uint8Array
}

/** Extracts the raw codec description (avcC/hvcC/vpcC/av1C payload) WebCodecs needs to configure a decoder. */
export function getCodecDescription(isoFile: ISOFile, track: Track): Uint8Array | undefined {
  const trak = isoFile.getTrackById(track.id)
  const entries = trak?.mdia?.minf?.stbl?.stsd?.entries ?? []
  for (const entry of entries) {
    const box =
      (entry as { avcC?: { write: (s: DataStream) => void } }).avcC ??
      (entry as { hvcC?: { write: (s: DataStream) => void } }).hvcC ??
      (entry as { vpcC?: { write: (s: DataStream) => void } }).vpcC ??
      (entry as { av1C?: { write: (s: DataStream) => void } }).av1C
    if (!box) continue
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mp4box's .d.ts marks `position` protected, but it's a plain runtime field; this is the standard mp4box+WebCodecs interop pattern.
    const stream = new DataStream(undefined, 0, Endianness.BIG_ENDIAN) as any
    box.write(stream)
    // mp4box writes the full box (8-byte size+type header included) — strip it for a raw codec description.
    return new Uint8Array(stream.buffer as ArrayBuffer, 8, stream.position - 8)
  }
  return undefined
}

function estimateFps(track: Track): number | undefined {
  if (!track.nb_samples || !track.duration || !track.timescale) return undefined
  const seconds = track.duration / track.timescale
  return seconds > 0 ? track.nb_samples / seconds : undefined
}

export interface ContainerInfo {
  durationMicros: number
  width?: number
  height?: number
  fps?: number
  hasVideo: boolean
  hasAudio: boolean
  videoCodec?: string
  audioCodec?: string
}

/** Parses container metadata (duration, dimensions, fps, codecs) without decoding or reading sample data. */
export function probeContainer(file: File): Promise<ContainerInfo> {
  return new Promise((resolve, reject) => {
    const isoFile = createFile()
    let settled = false

    isoFile.onError = (_module: string, message: string) => {
      if (settled) return
      settled = true
      reject(new Error(message))
    }

    isoFile.onReady = (movie: Movie) => {
      if (settled) return
      settled = true
      const videoTrack = movie.videoTracks[0]
      const audioTrack = movie.audioTracks[0]
      resolve({
        durationMicros: Math.round((movie.duration / movie.timescale) * 1_000_000),
        width: videoTrack?.video?.width,
        height: videoTrack?.video?.height,
        fps: videoTrack ? estimateFps(videoTrack) : undefined,
        hasVideo: movie.videoTracks.length > 0,
        hasAudio: movie.audioTracks.length > 0,
        videoCodec: videoTrack?.codec,
        audioCodec: audioTrack?.codec,
      })
    }

    pumpFile(file, isoFile).catch((err: unknown) => {
      if (settled) return
      settled = true
      reject(err instanceof Error ? err : new Error(String(err)))
    })
  })
}

export interface DemuxVideoCallbacks {
  /** Called synchronously once track metadata is known — configure a VideoDecoder here before returning. */
  onTrackInfo: (info: VideoTrackInfo) => void
  onSample: (chunk: EncodedVideoChunkInit) => void
}

/**
 * Single-pass demux of a file's video track: parses metadata, then streams
 * every sample through `onSample` in decode order. Used by the proxy/
 * thumbnail pipeline, which needs actual sample data (unlike probeContainer).
 */
export function demuxVideoTrack(file: File, callbacks: DemuxVideoCallbacks): Promise<void> {
  return new Promise((resolve, reject) => {
    const isoFile = createFile()
    let settled = false
    let gotTrack = false

    isoFile.onError = (_module: string, message: string) => {
      if (settled) return
      settled = true
      reject(new Error(message))
    }

    isoFile.onReady = (movie: Movie) => {
      const track = movie.videoTracks[0]
      if (!track?.video) {
        settled = true
        reject(new Error('No video track found'))
        return
      }
      gotTrack = true
      callbacks.onTrackInfo({
        id: track.id,
        codec: track.codec,
        width: track.video.width,
        height: track.video.height,
        durationMicros: Math.round((track.duration / track.timescale) * 1_000_000),
        fps: estimateFps(track),
        description: getCodecDescription(isoFile, track),
      })
      isoFile.setExtractionOptions(track.id, undefined, { nbSamples: 200 })
      isoFile.start()
    }

    isoFile.onSamples = (_id, _user, samples) => {
      for (const sample of samples) {
        if (!sample.data) continue
        callbacks.onSample({
          type: sample.is_sync ? 'key' : 'delta',
          timestamp: Math.round((sample.cts / sample.timescale) * 1_000_000),
          duration: Math.round((sample.duration / sample.timescale) * 1_000_000),
          data: sample.data.buffer.slice(
            sample.data.byteOffset,
            sample.data.byteOffset + sample.data.byteLength,
          ) as ArrayBuffer,
        })
      }
    }

    pumpFile(file, isoFile)
      .then(() => {
        if (settled) return
        settled = true
        if (!gotTrack) reject(new Error('Stream ended before video track metadata was parsed'))
        else resolve()
      })
      .catch((err: unknown) => {
        if (settled) return
        settled = true
        reject(err instanceof Error ? err : new Error(String(err)))
      })
  })
}

async function pumpFile(file: File, isoFile: ISOFile): Promise<void> {
  const reader = file.stream().getReader()
  let offset = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) {
      isoFile.flush()
      return
    }
    const chunk = MP4BoxBuffer.fromArrayBuffer(
      value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength),
      offset,
    )
    offset += value.byteLength
    isoFile.appendBuffer(chunk)
  }
}
