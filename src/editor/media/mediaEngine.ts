import * as Comlink from 'comlink'
import type { MediaWorkerApi, ProcessVideoResult } from './worker'

let workerApi: Comlink.Remote<MediaWorkerApi> | null = null

function getWorker(): Comlink.Remote<MediaWorkerApi> {
  workerApi ??= Comlink.wrap<MediaWorkerApi>(
    new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
  )
  return workerApi
}

// One import-processing job at a time, in submission order — proxy/thumbnail
// generation is CPU-heavy and iPad has little memory headroom to spare on
// overlapping decode/encode pipelines.
let queue: Promise<unknown> = Promise.resolve()

function enqueue<T>(job: () => Promise<T>): Promise<T> {
  const result = queue.then(job, job)
  queue = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

// Belt-and-braces: `generateVideoDerivatives` checks codec support up front
// specifically so it never hangs, but a worker job that never resolves for
// some *other* reason (a crashed worker, a genuinely stuck decode) would
// otherwise leave the asset stuck in "processing" forever with no recourse.
const PROCESS_VIDEO_TIMEOUT_MS = 120_000

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error)
      },
    )
  })
}

export function processVideoAsset(projectId: string, assetId: string): Promise<ProcessVideoResult> {
  return enqueue(() =>
    withTimeout(
      getWorker().processVideo({ projectId, assetId }),
      PROCESS_VIDEO_TIMEOUT_MS,
      'Video processing timed out',
    ),
  )
}
