import { migrateProjectDoc } from '#/editor/doc/migrate'
import { createId, type ProjectDoc } from '#/editor/doc/schema'
import { processVideoAsset } from '#/editor/media/mediaEngine'
import { generateWaveform } from '#/editor/media/waveform'
import { readOriginal, writeOriginal, writeWaveform } from '#/editor/media/assetStorage'
import { saveProject } from './idb'
import { buildZip, parseZip } from './zip'

const DOC_ENTRY_PATH = 'project.json'

function assetEntryPath(assetId: string): string {
  return `assets/${assetId}/original`
}

/**
 * Backs up a project as a `.ccproj` (zip) archive: the doc plus every
 * asset's original file. Proxies/thumbnails/waveforms are deliberately
 * excluded — they're regenerated on restore — so the archive stays close
 * to the size of the source media rather than roughly double.
 */
export async function exportProjectBackup(projectId: string, doc: ProjectDoc): Promise<Blob> {
  const entries = [{ path: DOC_ENTRY_PATH, data: new TextEncoder().encode(JSON.stringify(doc)) }]

  for (const asset of doc.assets) {
    try {
      const file = await readOriginal(projectId, asset.id)
      entries.push({ path: assetEntryPath(asset.id), data: new Uint8Array(await file.arrayBuffer()) })
    } catch {
      // Asset never finished importing (no original on disk) — skip it; the
      // restored project will just be missing that one asset.
    }
  }

  return buildZip(entries)
}

export interface RestoreProgress {
  assetsProcessed: number
  totalAssets: number
}

/**
 * Restores a `.ccproj` archive as a brand-new project (a fresh id, so
 * restoring a backup never collides with a project that still exists).
 * Regenerates every video's proxy/thumbnails and every audio track's
 * waveform from the restored originals before returning — restore is a
 * single blocking operation rather than a background job, since there's no
 * open editor session to stream progress into via the command bus.
 */
export async function restoreProjectBackup(blob: Blob, onProgress?: (progress: RestoreProgress) => void): Promise<ProjectDoc> {
  const entries = await parseZip(blob)
  const docEntry = entries.find((e) => e.path === DOC_ENTRY_PATH)
  if (!docEntry) throw new Error('Not a valid CapCut backup: missing project.json')

  const rawDoc = JSON.parse(new TextDecoder().decode(docEntry.data))
  const sourceDoc = migrateProjectDoc(rawDoc)

  const newId = createId()
  const now = Date.now()
  const doc: ProjectDoc = { ...sourceDoc, id: newId, createdAt: now, modifiedAt: now }

  const assetFiles = new Map(entries.filter((e) => e.path !== DOC_ENTRY_PATH).map((e) => [e.path, e.data]))
  const restorableAssetIds = new Set(doc.assets.filter((a) => assetFiles.has(assetEntryPath(a.id))).map((a) => a.id))

  // Assets whose original never made it into the backup can't be restored —
  // drop them (and any clips referencing them) rather than leave a doc that
  // references files that will never exist.
  doc.assets = doc.assets.filter((a) => restorableAssetIds.has(a.id))
  for (const track of doc.tracks) {
    track.clips = track.clips.filter((c) => !c.assetId || restorableAssetIds.has(c.assetId))
  }

  for (const asset of doc.assets) {
    const data = assetFiles.get(assetEntryPath(asset.id))
    if (!data) continue
    await writeOriginal(newId, asset.id, new Blob([new Uint8Array(data)]))
  }

  await saveProject(doc)

  let processed = 0
  const total = doc.assets.filter((a) => a.kind === 'video' || a.kind === 'audio').length
  onProgress?.({ assetsProcessed: 0, totalAssets: total })

  for (const asset of doc.assets) {
    if (asset.kind === 'video') {
      try {
        const result = await processVideoAsset(newId, asset.id)
        asset.proxy = { opfsPath: `assets/${asset.id}/proxy.mp4`, width: result.width, height: result.height }
        asset.thumbnailsPath = `assets/${asset.id}/thumbs`
        asset.status = 'ready'
      } catch (err) {
        asset.status = 'error'
        asset.errorMessage = err instanceof Error ? err.message : String(err)
      }
    }
    if (asset.kind === 'audio' || asset.kind === 'video') {
      try {
        const original = await readOriginal(newId, asset.id)
        const { peaks } = await generateWaveform(original)
        await writeWaveform(newId, asset.id, peaks)
        asset.waveformPath = `assets/${asset.id}/waveform.f32`
        if (asset.kind === 'audio') asset.status = 'ready'
      } catch {
        // No waveform (unsupported/undecodable audio codec) isn't fatal — same tolerance as a fresh import.
        if (asset.kind === 'audio') asset.status = 'ready'
      }
    }
    if (asset.kind === 'image') {
      asset.status = 'ready'
    }

    if (asset.kind === 'video' || asset.kind === 'audio') {
      processed++
      onProgress?.({ assetsProcessed: processed, totalAssets: total })
    }
  }

  doc.modifiedAt = Date.now()
  await saveProject(doc)
  return doc
}
