/**
 * H.264 video encoder using WebCodecs API.
 * Encodes frames to H.264 bitstream for MP4 muxing.
 */

export interface EncoderConfig {
  width: number
  height: number
  frameRate: number
  bitrate: number // bits per second
}

export interface EncodedFrame {
  data: Uint8Array
  timestamp: number // microseconds
  keyFrame: boolean
}

export class VideoEncoder {
  private encoder: any = null
  private encodedFrames: EncodedFrame[] = []
  private config: EncoderConfig

  constructor(config: EncoderConfig) {
    this.config = config
  }

  async init(): Promise<void> {
    const codec = 'avc1.42001f' // H.264 Baseline Profile
    const WebCodecVideoEncoder = (globalThis as any).VideoEncoder

    if (!WebCodecVideoEncoder) {
      throw new Error('VideoEncoder API not supported')
    }

    const encoderConfig = {
      codec,
      width: this.config.width,
      height: this.config.height,
      bitrate: this.config.bitrate,
      framerate: this.config.frameRate,
    }

    this.encoder = new WebCodecVideoEncoder({
      output: (chunk: any) => {
        const data = new Uint8Array(chunk.byteLength)
        chunk.copyTo(data)
        this.encodedFrames.push({
          data,
          timestamp: chunk.timestamp,
          keyFrame: chunk.type === 'key',
        })
      },
      error: (error: any) => {
        console.error('Encoder error:', error)
      },
    })

    await this.encoder.configure(encoderConfig)
  }

  async encodeFrame(videoFrame: VideoFrame, keyFrame: boolean = false): Promise<void> {
    if (!this.encoder) throw new Error('Encoder not initialized')

    this.encoder.encode(videoFrame, { keyFrame })
    if (this.encoder.flush) {
      await this.encoder.flush()
    }
  }

  getEncodedFrames(): EncodedFrame[] {
    return this.encodedFrames.splice(0)
  }

  async close(): Promise<void> {
    if (this.encoder) {
      await this.encoder.close()
      this.encoder = null
    }
  }
}

export interface AudioEncoderConfig {
  sampleRate: number
  numberOfChannels: number
  bitrate: number
}

/**
 * Audio encoder stub (AAC via Web Audio API).
 * Full implementation deferred — uses silent audio for now.
 */
export class AudioEncoder {
  private audioData: Float32Array[] = []

  constructor(_config: AudioEncoderConfig) {
    // Config stored for future use
  }

  async init(): Promise<void> {
    // Deferred: AudioEncoder API not yet standardized
  }

  encodeAudio(audioBuffer: AudioBuffer): void {
    // Collect audio samples for muxing
    const samples: Float32Array[] = []
    for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
      samples.push(audioBuffer.getChannelData(ch))
    }
    this.audioData.push(...samples)
  }

  getAudioData(): Float32Array[] {
    return this.audioData.splice(0)
  }

  async close(): Promise<void> {
    // Cleanup
  }
}
