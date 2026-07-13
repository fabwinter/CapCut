import type { Command } from './types'
import type { Transform } from '../schema'
import { createDefaultTextPayload } from '../schema'
import type { Micros } from '../time'
import { secondsToMicros } from '../time'

/**
 * Set clip speed (affects duration and audio rate).
 * Duration recomputes: newDuration = originalDuration / speed.
 * Example: 2 second clip at 2× speed becomes 1 second.
 */
export function setClipSpeed(clipId: string, speed: number): Command {
  return {
    name: 'SetClipSpeed',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip || speed <= 0 || speed > 10) return // Clamp 0.1–10×

      if (clip.speed === speed) return // No-op guard

      // Recompute duration based on speed change
      const oldSpeed = clip.speed
      const originalDuration = clip.durationMicros * oldSpeed
      clip.speed = speed
      clip.durationMicros = Math.round(originalDuration / speed)
      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Set clip volume (0–200%, clamped).
 */
export function setClipVolume(clipId: string, volume: number): Command {
  return {
    name: 'SetClipVolume',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      const clamped = Math.max(0, Math.min(2, volume))
      if (clip.volume === clamped) return // No-op guard

      clip.volume = clamped
      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Toggle clip mute state.
 */
export function setClipMuted(clipId: string, muted: boolean): Command {
  return {
    name: 'SetClipMuted',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      if (clip.muted === muted) return // No-op guard

      clip.muted = muted
      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Set fade-in duration (0–3s).
 */
export function setClipFadeIn(clipId: string, durationSeconds: number): Command {
  return {
    name: 'SetClipFadeIn',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      const micros = Math.max(0, Math.min(secondsToMicros(3), secondsToMicros(durationSeconds)))
      if (clip.fadeInMicros === micros) return // No-op guard

      clip.fadeInMicros = micros
      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Set fade-out duration (0–3s).
 */
export function setClipFadeOut(clipId: string, durationSeconds: number): Command {
  return {
    name: 'SetClipFadeOut',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      const micros = Math.max(0, Math.min(secondsToMicros(3), secondsToMicros(durationSeconds)))
      if (clip.fadeOutMicros === micros) return // No-op guard

      clip.fadeOutMicros = micros
      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Set clip transform (position, scale, rotation, opacity).
 * Used by preview canvas gestures.
 */
export function setClipTransform(clipId: string, transform: Partial<Transform>): Command {
  return {
    name: 'SetClipTransform',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      let changed = false
      const current = clip.transform

      if (transform.x !== undefined && current.x !== transform.x) {
        current.x = transform.x
        changed = true
      }
      if (transform.y !== undefined && current.y !== transform.y) {
        current.y = transform.y
        changed = true
      }
      if (transform.scale !== undefined && current.scale !== transform.scale) {
        current.scale = Math.max(0.1, transform.scale)
        changed = true
      }
      if (transform.rotation !== undefined && current.rotation !== transform.rotation) {
        current.rotation = transform.rotation
        changed = true
      }
      if (transform.opacity !== undefined && current.opacity !== transform.opacity) {
        current.opacity = Math.max(0, Math.min(1, transform.opacity))
        changed = true
      }

      if (changed) {
        draft.modifiedAt = Date.now()
      }
    },
  }
}

/**
 * Extract audio from a video clip to a linked audio track.
 * Creates a new audio clip with the same source time range.
 */
export function extractAudioFromClip(clipId: string): Command {
  return {
    name: 'ExtractAudioFromClip',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip || !clip.assetId) return

      // Find or create an audio track
      let audioTrack = draft.tracks.find((t) => t.kind === 'audio')
      if (!audioTrack) {
        // Create new audio track
        audioTrack = {
          id: crypto.randomUUID(),
          kind: 'audio',
          name: 'Audio',
          muted: false,
          locked: false,
          clips: [],
        }
        draft.tracks.push(audioTrack)
      }

      // Create audio clip with same timing and asset
      const audioClip = {
        id: crypto.randomUUID(),
        trackId: audioTrack.id,
        assetId: clip.assetId,
        startMicros: clip.startMicros,
        durationMicros: clip.durationMicros,
        inPointMicros: clip.inPointMicros,
        outPointMicros: clip.outPointMicros,
        speed: clip.speed,
        volume: 1,
        muted: false,
        fadeInMicros: 0,
        fadeOutMicros: 0,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: [],
        keyframes: [],
      }
      audioTrack.clips.push(audioClip)

      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Add a text clip to a text track.
 */
export function addTextClip(
  trackId: string,
  text: string,
  startMicros: Micros,
  durationMicros: Micros
): Command {
  return {
    name: 'AddTextClip',
    recipe: (draft) => {
      const track = draft.tracks.find((t) => t.id === trackId)
      if (!track || track.kind !== 'text') return

      const textClip = {
        id: crypto.randomUUID(),
        trackId,
        assetId: undefined,
        startMicros,
        durationMicros,
        inPointMicros: 0,
        outPointMicros: undefined,
        speed: 1,
        volume: 1,
        muted: false,
        fadeInMicros: 0,
        fadeOutMicros: 0,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        effects: [],
        keyframes: [],
        text: createDefaultTextPayload(text),
      }
      track.clips.push(textClip)

      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Set project aspect ratio via settings (9:16, 16:9, 1:1, 4:5).
 */
export function setProjectAspect(aspectRatio: '9:16' | '16:9' | '1:1' | '4:5'): Command {
  return {
    name: 'SetProjectAspect',
    recipe: (draft) => {
      const [w, h] = parseAspectRatio(aspectRatio)

      // Scale to common heights
      const height = 1920
      const width = Math.round((height * w) / h)

      if (draft.settings.width === width && draft.settings.height === height) {
        return // No-op guard
      }

      draft.settings.width = width
      draft.settings.height = height
      draft.modifiedAt = Date.now()
    },
  }
}

function parseAspectRatio(ratio: string): [number, number] {
  switch (ratio) {
    case '9:16':
      return [9, 16]
    case '16:9':
      return [16, 9]
    case '1:1':
      return [1, 1]
    case '4:5':
      return [4, 5]
    default:
      return [9, 16]
  }
}

/**
 * Helper: find a clip by ID across all tracks.
 */
function findClipById(draft: any, clipId: string): any {
  for (const track of draft.tracks) {
    const clip = track.clips.find((c: any) => c.id === clipId)
    if (clip) return clip
  }
  return null
}
