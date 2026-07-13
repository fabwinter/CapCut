/**
 * Export commands for saving projects to video files.
 */

import type { Command } from './types'
import type { ProjectDoc } from '../schema'

/**
 * Initiate video export.
 * Validates project, collects render parameters, and returns export config.
 */
export function initExport(doc: ProjectDoc): {
  valid: boolean
  error?: string
  config?: {
    width: number
    height: number
    fps: number
    duration: number
    bitrate: number
  }
} {
  // Validate project has tracks
  if (!doc.tracks || doc.tracks.length === 0) {
    return { valid: false, error: 'No tracks in project' }
  }

  // Calculate project duration
  let projectDurationMicros = 0
  for (const track of doc.tracks) {
    for (const clip of track.clips) {
      const endMicros = clip.startMicros + clip.durationMicros
      projectDurationMicros = Math.max(projectDurationMicros, endMicros)
    }
  }

  if (projectDurationMicros === 0) {
    return { valid: false, error: 'Project has no clips' }
  }

  // Calculate bitrate (8 Mbps for HD, scales with resolution)
  const pixelCount = doc.settings.width * doc.settings.height
  const baseBitrate = 8_000_000 // 8 Mbps
  const bitrate = Math.round(baseBitrate * (pixelCount / (1920 * 1080)))

  return {
    valid: true,
    config: {
      width: doc.settings.width,
      height: doc.settings.height,
      fps: doc.settings.fps,
      duration: projectDurationMicros,
      bitrate,
    },
  }
}

/**
 * Prepare export by validating and collecting render frames.
 * (Full implementation deferred — returns stub for now.)
 */
export function prepareExport(doc: ProjectDoc) {
  const validation = initExport(doc)
  if (!validation.valid) {
    return { valid: false, error: validation.error }
  }

  return {
    valid: true,
    doc,
    config: validation.config,
  }
}

/**
 * Mark export as complete in project metadata.
 * (Deferred — no-op for now as export state not persisted.)
 */
export function completeExport(
  _doc: ProjectDoc,
  _videoBlob: Blob
): Command {
  return {
    name: 'CompleteExport',
    recipe: (draft) => {
      // Future: store export metadata in project
      draft.modifiedAt = Date.now()
    },
  }
}
