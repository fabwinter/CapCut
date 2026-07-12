/// <reference lib="webworker" />
import * as Comlink from 'comlink'
import { readOriginal, writeProxy, writeThumbnails } from './assetStorage'
import {
  DEFAULT_VIDEO_DERIVATIVES_OPTIONS,
  generateVideoDerivatives,
  type VideoDerivativesOptions,
} from './videoDerivatives'

export interface ProcessVideoInput {
  projectId: string
  assetId: string
  options?: Partial<VideoDerivativesOptions>
}

export interface ProcessVideoResult {
  width: number
  height: number
  thumbnailCount: number
  thumbnailIntervalMicros: number
}

const api = {
  async processVideo(input: ProcessVideoInput): Promise<ProcessVideoResult> {
    const file = await readOriginal(input.projectId, input.assetId)
    const options = { ...DEFAULT_VIDEO_DERIVATIVES_OPTIONS, ...input.options }
    const result = await generateVideoDerivatives(file, options)
    await writeProxy(input.projectId, input.assetId, result.proxy.blob)
    await writeThumbnails(input.projectId, input.assetId, result.thumbnails, result.thumbnailIntervalMicros)
    return {
      width: result.proxy.width,
      height: result.proxy.height,
      thumbnailCount: result.thumbnails.length,
      thumbnailIntervalMicros: result.thumbnailIntervalMicros,
    }
  },
}

export type MediaWorkerApi = typeof api

Comlink.expose(api)
