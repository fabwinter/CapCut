/**
 * Runtime feature detection. iPad Safari's WebCodecs/OPFS/SharedArrayBuffer
 * support varies by iPadOS version, so nothing in the media pipeline assumes
 * a capability is present — it checks this probe (or fails fast with a
 * clear error) instead of discovering the gap mid-decode.
 */
export interface Capabilities {
  webCodecs: boolean
  videoDecodeH264: boolean
  videoEncodeH264: boolean
  audioDecodeAAC: boolean
  audioEncodeAAC: boolean
  opfs: boolean
  sharedArrayBuffer: boolean
  crossOriginIsolated: boolean
  webgl2: boolean
}

const H264_BASELINE_CODEC = 'avc1.42001f'
const AAC_LC_CODEC = 'mp4a.40.2'

async function isVideoDecodeSupported(codec: string): Promise<boolean> {
  if (typeof VideoDecoder === 'undefined') return false
  try {
    const result = await VideoDecoder.isConfigSupported({ codec, codedWidth: 1280, codedHeight: 720 })
    return result.supported ?? false
  } catch {
    return false
  }
}

async function isVideoEncodeSupported(codec: string): Promise<boolean> {
  if (typeof VideoEncoder === 'undefined') return false
  try {
    const result = await VideoEncoder.isConfigSupported({
      codec,
      width: 1280,
      height: 720,
      bitrate: 2_000_000,
      framerate: 30,
    })
    return result.supported ?? false
  } catch {
    return false
  }
}

async function isAudioDecodeSupported(codec: string): Promise<boolean> {
  if (typeof AudioDecoder === 'undefined') return false
  try {
    const result = await AudioDecoder.isConfigSupported({ codec, sampleRate: 44100, numberOfChannels: 2 })
    return result.supported ?? false
  } catch {
    return false
  }
}

async function isAudioEncodeSupported(codec: string): Promise<boolean> {
  if (typeof AudioEncoder === 'undefined') return false
  try {
    const result = await AudioEncoder.isConfigSupported({
      codec,
      sampleRate: 44100,
      numberOfChannels: 2,
      bitrate: 128_000,
    })
    return result.supported ?? false
  } catch {
    return false
  }
}

function hasOpfs(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function'
}

function hasWebgl2(): boolean {
  if (typeof document === 'undefined') return false
  try {
    const canvas = document.createElement('canvas')
    return canvas.getContext('webgl2') !== null
  } catch {
    return false
  }
}

export async function probeCapabilities(): Promise<Capabilities> {
  const webCodecs = typeof VideoDecoder !== 'undefined' && typeof VideoEncoder !== 'undefined'

  const [videoDecodeH264, videoEncodeH264, audioDecodeAAC, audioEncodeAAC] = await Promise.all([
    isVideoDecodeSupported(H264_BASELINE_CODEC),
    isVideoEncodeSupported(H264_BASELINE_CODEC),
    isAudioDecodeSupported(AAC_LC_CODEC),
    isAudioEncodeSupported(AAC_LC_CODEC),
  ])

  return {
    webCodecs,
    videoDecodeH264,
    videoEncodeH264,
    audioDecodeAAC,
    audioEncodeAAC,
    opfs: hasOpfs(),
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    crossOriginIsolated: typeof self !== 'undefined' && self.crossOriginIsolated === true,
    webgl2: hasWebgl2(),
  }
}
