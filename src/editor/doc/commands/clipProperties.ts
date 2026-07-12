import type { Clip } from '../schema'
import type { Command } from './types'

const MIN_SPEED = 0.1
const MAX_SPEED = 10
const MIN_VOLUME = 0
const MAX_VOLUME = 2

function findClip(draft: { tracks: { clips: Clip[] }[] }, clipId: string): Clip | undefined {
  for (const track of draft.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return undefined
}

/**
 * Changes playback speed while preserving the exact source range consumed —
 * the clip's timeline duration changes inversely so trims stay put (CapCut
 * behavior), not the in/out points.
 */
export function setClipSpeed(clipId: string, speed: number): Command {
  return {
    name: 'SetClipSpeed',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      if (!clip) return
      const clamped = Math.min(MAX_SPEED, Math.max(MIN_SPEED, speed))
      if (clamped === clip.speed) return
      const sourceSpanMicros = clip.durationMicros * clip.speed
      clip.speed = clamped
      clip.durationMicros = Math.max(1, Math.round(sourceSpanMicros / clamped))
      draft.modifiedAt = Date.now()
    },
  }
}

export function setClipVolume(clipId: string, volume: number): Command {
  return {
    name: 'SetClipVolume',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      if (!clip) return
      const clamped = Math.min(MAX_VOLUME, Math.max(MIN_VOLUME, volume))
      if (clamped === clip.volume) return
      clip.volume = clamped
      draft.modifiedAt = Date.now()
    },
  }
}

export function setClipMuted(clipId: string, muted: boolean): Command {
  return {
    name: 'SetClipMuted',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      if (!clip || clip.muted === muted) return
      clip.muted = muted
      draft.modifiedAt = Date.now()
    },
  }
}

export interface ClipFadePatch {
  fadeInMicros?: number
  fadeOutMicros?: number
}

export function setClipFades(clipId: string, patch: ClipFadePatch): Command {
  return {
    name: 'SetClipFades',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      if (!clip) return
      let changed = false
      if (patch.fadeInMicros !== undefined) {
        const clamped = Math.max(0, Math.min(clip.durationMicros, Math.round(patch.fadeInMicros)))
        if (clamped !== clip.fadeInMicros) {
          clip.fadeInMicros = clamped
          changed = true
        }
      }
      if (patch.fadeOutMicros !== undefined) {
        const clamped = Math.max(0, Math.min(clip.durationMicros, Math.round(patch.fadeOutMicros)))
        if (clamped !== clip.fadeOutMicros) {
          clip.fadeOutMicros = clamped
          changed = true
        }
      }
      if (changed) draft.modifiedAt = Date.now()
    },
  }
}
