import { fileExists, getAssetDir, readFile, writeFile } from '#/storage/opfs'

/**
 * Fixed filenames inside an asset's OPFS directory
 * (/projects/{projectId}/assets/{assetId}/...). AssetRef.opfsPath is
 * informational; every read/write goes through these helpers so the layout
 * only needs to change in one place.
 */
const ORIGINAL_FILENAME = 'original'
const PROXY_FILENAME = 'proxy.mp4'
const WAVEFORM_FILENAME = 'waveform.f32'
const THUMBS_DIR = 'thumbs'
const THUMBS_MANIFEST = 'manifest.json'

export interface ThumbnailManifest {
  count: number
  intervalMicros: number
}

export async function writeOriginal(projectId: string, assetId: string, file: Blob): Promise<void> {
  const dir = await getAssetDir(projectId, assetId)
  await writeFile(dir, ORIGINAL_FILENAME, file)
}

export async function readOriginal(projectId: string, assetId: string): Promise<File> {
  const dir = await getAssetDir(projectId, assetId, false)
  return readFile(dir, ORIGINAL_FILENAME)
}

export async function writeProxy(projectId: string, assetId: string, blob: Blob): Promise<void> {
  const dir = await getAssetDir(projectId, assetId)
  await writeFile(dir, PROXY_FILENAME, blob)
}

export async function readProxy(projectId: string, assetId: string): Promise<File> {
  const dir = await getAssetDir(projectId, assetId, false)
  return readFile(dir, PROXY_FILENAME)
}

export async function hasProxy(projectId: string, assetId: string): Promise<boolean> {
  const dir = await getAssetDir(projectId, assetId, false).catch(() => undefined)
  if (!dir) return false
  return fileExists(dir, PROXY_FILENAME)
}

export async function writeWaveform(projectId: string, assetId: string, peaks: Float32Array): Promise<void> {
  const dir = await getAssetDir(projectId, assetId)
  await writeFile(dir, WAVEFORM_FILENAME, new Blob([peaks.buffer as ArrayBuffer]))
}

export async function readWaveform(projectId: string, assetId: string): Promise<Float32Array> {
  const dir = await getAssetDir(projectId, assetId, false)
  const file = await readFile(dir, WAVEFORM_FILENAME)
  const buffer = await file.arrayBuffer()
  return new Float32Array(buffer)
}

export async function writeThumbnails(
  projectId: string,
  assetId: string,
  thumbnails: Blob[],
  intervalMicros: number,
): Promise<void> {
  const assetDir = await getAssetDir(projectId, assetId)
  const thumbsDir = await assetDir.getDirectoryHandle(THUMBS_DIR, { create: true })
  await Promise.all(thumbnails.map((blob, i) => writeFile(thumbsDir, `${i}.jpg`, blob)))
  const manifest: ThumbnailManifest = { count: thumbnails.length, intervalMicros }
  await writeFile(thumbsDir, THUMBS_MANIFEST, new Blob([JSON.stringify(manifest)], { type: 'application/json' }))
}

export async function readThumbnailManifest(
  projectId: string,
  assetId: string,
): Promise<ThumbnailManifest | undefined> {
  const assetDir = await getAssetDir(projectId, assetId, false).catch(() => undefined)
  if (!assetDir) return undefined
  const thumbsDir = await assetDir.getDirectoryHandle(THUMBS_DIR).catch(() => undefined)
  if (!thumbsDir) return undefined
  const exists = await fileExists(thumbsDir, THUMBS_MANIFEST)
  if (!exists) return undefined
  const file = await readFile(thumbsDir, THUMBS_MANIFEST)
  return JSON.parse(await file.text())
}

export async function readThumbnail(projectId: string, assetId: string, index: number): Promise<File> {
  const assetDir = await getAssetDir(projectId, assetId, false)
  const thumbsDir = await assetDir.getDirectoryHandle(THUMBS_DIR)
  return readFile(thumbsDir, `${index}.jpg`)
}
