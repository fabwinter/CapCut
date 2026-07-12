/**
 * Runs on the main thread deliberately: Web Audio's AudioContext/
 * decodeAudioData is not reliably available inside a plain dedicated Worker
 * across browsers (unlike WebCodecs, which is), so waveform generation stays
 * off the worker used for proxy/thumbnail generation. decodeAudioData itself
 * decodes off the JS main thread internally, so this doesn't block the UI.
 */
const DEFAULT_BUCKETS_PER_SECOND = 50

export interface WaveformResult {
  peaks: Float32Array
  bucketsPerSecond: number
}

/** One absolute-peak sample per bucket, buckets spaced `1/bucketsPerSecond` apart, channels averaged. */
export async function generateWaveform(
  file: File,
  bucketsPerSecond = DEFAULT_BUCKETS_PER_SECOND,
): Promise<WaveformResult> {
  const arrayBuffer = await file.arrayBuffer()
  const audioContext = new AudioContext()
  try {
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const bucketCount = Math.max(1, Math.ceil(audioBuffer.duration * bucketsPerSecond))
    const samplesPerBucket = Math.max(1, Math.floor(audioBuffer.length / bucketCount))
    const peaks = new Float32Array(bucketCount)

    const channelData: Float32Array[] = []
    for (let c = 0; c < audioBuffer.numberOfChannels; c++) channelData.push(audioBuffer.getChannelData(c))

    for (let bucket = 0; bucket < bucketCount; bucket++) {
      const start = bucket * samplesPerBucket
      const end = Math.min(start + samplesPerBucket, audioBuffer.length)
      let peak = 0
      for (let i = start; i < end; i++) {
        for (const channel of channelData) {
          const abs = Math.abs(channel[i])
          if (abs > peak) peak = abs
        }
      }
      peaks[bucket] = peak
    }

    return { peaks, bucketsPerSecond }
  } finally {
    await audioContext.close()
  }
}
