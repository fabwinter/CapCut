/**
 * Export worker for encoding and muxing video.
 * Runs in a separate thread to avoid blocking the UI.
 *
 * Message format:
 * { type: 'init', payload: { config, frames } }
 * { type: 'encodeFrame', payload: { frame, keyFrame } }
 * { type: 'finalize', payload: {} }
 */

import { VideoEncoder, type EncoderConfig, type EncodedFrame } from './encoder'

interface InitMessage {
  type: 'init'
  payload: {
    config: EncoderConfig
  }
}

interface EncodeFrameMessage {
  type: 'encodeFrame'
  payload: {
    frame: VideoFrame
    keyFrame: boolean
  }
}

interface FinalizeMessage {
  type: 'finalize'
}

type WorkerMessage = InitMessage | EncodeFrameMessage | FinalizeMessage

let encoder: VideoEncoder | null = null
const encodedFrames: EncodedFrame[] = []

self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
  const message = event.data as any

  try {
    switch (message.type) {
      case 'init': {
        const { config } = message.payload
        encoder = new VideoEncoder(config)
        await encoder.init()
        self.postMessage({ type: 'ready' })
        break
      }

      case 'encodeFrame': {
        if (!encoder) throw new Error('Encoder not initialized')
        const { frame, keyFrame } = message.payload
        await encoder.encodeFrame(frame, keyFrame)

        // Send progress update
        const frames = encoder.getEncodedFrames()
        encodedFrames.push(...frames)
        self.postMessage({
          type: 'progress',
          payload: { encodedCount: encodedFrames.length },
        })
        break
      }

      case 'finalize': {
        if (!encoder) throw new Error('Encoder not initialized')
        await encoder.close()
        self.postMessage({
          type: 'complete',
          payload: { totalFrames: encodedFrames.length },
        })
        break
      }

      default:
        throw new Error(`Unknown message type: ${message.type}`)
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      payload: { message: (error as Error).message },
    })
  }
}
