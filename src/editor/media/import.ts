import { addAsset, setAssetStatus, updateAsset } from '#/editor/doc/commands/assets'
import type { Command } from '#/editor/doc/commands/types'
import { createId, type AssetKind } from '#/editor/doc/schema'
import { writeOriginal, writeWaveform } from './assetStorage'
import { probeContainer } from './demux'
import { processVideoAsset } from './mediaEngine'
import { generateWaveform } from './waveform'

function kindFromMime(mime: string): AssetKind | undefined {
  if (mime.startsWith('video/')) return 'video'
  if (mime.startsWith('audio/')) return 'audio'
  if (mime.startsWith('image/')) return 'image'
  return undefined
}

/**
 * Imports a user-picked file into the project: copies it into OPFS, probes
 * its metadata, and kicks off proxy/thumbnail/waveform generation. Every
 * step reports through `dispatch` so the media library reflects live status
 * (importing → processing → ready/error) without the caller polling.
 */
export async function importMediaFile(
  projectId: string,
  file: File,
  dispatch: (command: Command) => void,
): Promise<string> {
  const kind = kindFromMime(file.type)
  if (!kind) throw new Error(`Unsupported file type: ${file.type || 'unknown'}`)

  const assetId = createId()
  dispatch(
    addAsset({
      id: assetId,
      kind,
      opfsPath: `assets/${assetId}/original`,
      originalName: file.name,
      status: 'importing',
      createdAt: Date.now(),
    }),
  )

  try {
    await writeOriginal(projectId, assetId, file)

    let hasAudio = kind === 'audio'
    if (kind === 'video' || kind === 'audio') {
      const info = await probeContainer(file)
      hasAudio = info.hasAudio
      dispatch(
        updateAsset(assetId, {
          durationMicros: info.durationMicros,
          width: info.width,
          height: info.height,
          fps: info.fps,
        }),
      )
    } else if (kind === 'image') {
      const bitmap = await createImageBitmap(file)
      dispatch(updateAsset(assetId, { width: bitmap.width, height: bitmap.height }))
      bitmap.close()
    }

    dispatch(setAssetStatus(assetId, 'processing'))

    const jobs: Promise<unknown>[] = []
    if (kind === 'video') {
      jobs.push(
        processVideoAsset(projectId, assetId).then((result) => {
          dispatch(
            updateAsset(assetId, {
              proxy: { opfsPath: `assets/${assetId}/proxy.mp4`, width: result.width, height: result.height },
              thumbnailsPath: `assets/${assetId}/thumbs`,
            }),
          )
        }),
      )
    }
    if (hasAudio) {
      // A missing waveform (undecodable/unsupported audio codec) shouldn't
      // fail the whole import — the asset is still usable, just without a
      // waveform visualization. Video proxy failures, by contrast, are fatal:
      // without a proxy there's nothing to edit against.
      jobs.push(
        generateWaveform(file)
          .then(async ({ peaks }) => {
            await writeWaveform(projectId, assetId, peaks)
            dispatch(updateAsset(assetId, { waveformPath: `assets/${assetId}/waveform.f32` }))
          })
          .catch((err: unknown) => {
            console.warn(`Waveform generation skipped for asset ${assetId}:`, err)
          }),
      )
    }
    await Promise.all(jobs)

    dispatch(setAssetStatus(assetId, 'ready'))
  } catch (error) {
    dispatch(setAssetStatus(assetId, 'error', error instanceof Error ? error.message : String(error)))
    throw error
  }

  return assetId
}
