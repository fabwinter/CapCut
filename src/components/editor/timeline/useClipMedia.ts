import { useEffect, useState } from 'react'
import type { AssetRef, Clip } from '#/editor/doc/schema'
import { readThumbnail, readThumbnailManifest, readWaveform } from '#/editor/media/assetStorage'
import { DEFAULT_BUCKETS_PER_SECOND } from '#/editor/media/waveform'

const MAX_THUMBNAIL_TILES = 8

/** Thumbnail tiles covering the clip's visible slice of the source asset, oldest-first. */
export function useClipThumbnails(projectId: string, asset: AssetRef | undefined, clip: Clip): string[] {
  const [urls, setUrls] = useState<string[]>([])
  const ready = asset?.status === 'ready' && !!asset.thumbnailsPath

  useEffect(() => {
    if (!ready || !asset) return
    let cancelled = false
    const objectUrls: string[] = []

    readThumbnailManifest(projectId, asset.id).then(async (manifest) => {
      if (cancelled || !manifest || manifest.count === 0) return
      const sourceStart = clip.inPointMicros
      const sourceEnd = clip.inPointMicros + clip.durationMicros * clip.speed
      const firstIndex = Math.max(0, Math.floor(sourceStart / manifest.intervalMicros))
      const lastIndex = Math.min(manifest.count - 1, Math.ceil(sourceEnd / manifest.intervalMicros))
      const span = Math.max(1, lastIndex - firstIndex)
      const tileCount = Math.min(MAX_THUMBNAIL_TILES, lastIndex - firstIndex + 1)

      const indices = Array.from({ length: tileCount }, (_, i) =>
        Math.min(lastIndex, firstIndex + Math.round((i * span) / Math.max(1, tileCount - 1))),
      )
      const files = await Promise.all(indices.map((i) => readThumbnail(projectId, asset.id, i).catch(() => undefined)))
      if (cancelled) return
      const next = files.filter((f): f is File => !!f).map((f) => URL.createObjectURL(f))
      objectUrls.push(...next)
      setUrls(next)
    })

    return () => {
      cancelled = true
      for (const url of objectUrls) URL.revokeObjectURL(url)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the source slice actually changes
  }, [projectId, asset?.id, ready, clip.inPointMicros, clip.durationMicros, clip.speed])

  return urls
}

/** Waveform peak buckets covering the clip's visible slice of the source asset. */
export function useClipWaveformPeaks(projectId: string, asset: AssetRef | undefined, clip: Clip): Float32Array | undefined {
  const [peaks, setPeaks] = useState<Float32Array | undefined>(undefined)
  const ready = asset?.status === 'ready' && !!asset.waveformPath

  useEffect(() => {
    if (!ready || !asset) {
      setPeaks(undefined)
      return
    }
    let cancelled = false
    readWaveform(projectId, asset.id)
      .then((all) => {
        if (cancelled) return
        const startBucket = Math.floor((clip.inPointMicros / 1_000_000) * DEFAULT_BUCKETS_PER_SECOND)
        const endBucket = Math.ceil(
          ((clip.inPointMicros + clip.durationMicros * clip.speed) / 1_000_000) * DEFAULT_BUCKETS_PER_SECOND,
        )
        setPeaks(all.slice(Math.max(0, startBucket), Math.min(all.length, endBucket)))
      })
      .catch(() => setPeaks(undefined))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run only when the source slice actually changes
  }, [projectId, asset?.id, ready, clip.inPointMicros, clip.durationMicros, clip.speed])

  return peaks
}
