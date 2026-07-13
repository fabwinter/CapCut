import type { Command } from './types'
import type { Clip } from '../schema'
import { createId, createDefaultTransform } from '../schema'
import type { Micros } from '../time'
import { snapToFrame } from '../time'

/**
 * Create a clip with sensible defaults.
 */
export function createClip(
  trackId: string,
  assetId: string | undefined,
  startMicros: Micros,
  durationMicros: Micros,
  inPointMicros: Micros = 0
): Clip {
  return {
    id: createId(),
    trackId,
    assetId,
    startMicros,
    durationMicros,
    inPointMicros,
    outPointMicros: inPointMicros + durationMicros,
    speed: 1,
    volume: 1,
    muted: false,
    fadeInMicros: 0,
    fadeOutMicros: 0,
    transform: createDefaultTransform(),
    effects: [],
    keyframes: [],
  }
}

/**
 * Add a clip to a track from the media library.
 * Placed after existing clips on that track (at timeline position = sum of prior durations).
 */
export function addClipFromAsset(
  trackId: string,
  assetId: string,
  durationMicros: Micros,
  fps: number
): Command {
  return {
    name: 'AddClipFromAsset',
    recipe: (draft) => {
      const track = draft.tracks.find((t) => t.id === trackId)
      if (!track) return

      // Position at end of track
      let startMicros: Micros = 0
      for (const clip of track.clips) {
        const clipEnd = clip.startMicros + clip.durationMicros
        if (clipEnd > startMicros) startMicros = clipEnd as Micros
      }
      startMicros = snapToFrame(startMicros, fps)

      const clip = createClip(trackId, assetId, startMicros, durationMicros)
      track.clips.push(clip)
      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Move a clip to a different start time (possibly to a different track).
 * Snaps to frame boundaries.
 */
export function moveClip(
  clipId: string,
  newTrackId: string,
  newStartMicros: Micros,
  fps: number
): Command {
  return {
    name: 'MoveClip',
    recipe: (draft) => {
      let clip: Clip | null = null
      let oldTrackId: string | null = null

      // Find and remove clip from its current track
      for (const track of draft.tracks) {
        const idx = track.clips.findIndex((c) => c.id === clipId)
        if (idx !== -1) {
          clip = track.clips[idx]
          oldTrackId = track.id
          track.clips.splice(idx, 1)
          break
        }
      }

      if (!clip || !oldTrackId) return

      // Add to new track
      const newTrack = draft.tracks.find((t) => t.id === newTrackId)
      if (!newTrack) return

      clip.trackId = newTrackId
      clip.startMicros = snapToFrame(newStartMicros, fps)
      newTrack.clips.push(clip)
      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Trim the start of a clip by adjusting its inPointMicros and startMicros.
 * newInPointMicros should be >= 0 and < current outPointMicros.
 * The clip's visual start position shifts to maintain outpoint.
 */
export function trimClipStart(
  clipId: string,
  newInPointMicros: Micros,
  _fps: number  // Currently unused; reserved for future frame-snapping
): Command {
  return {
    name: 'TrimClipStart',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      const outPoint = clip.outPointMicros ?? clip.inPointMicros + clip.durationMicros
      const trimmedDuration = outPoint - newInPointMicros

      if (trimmedDuration <= 0) return // Invalid trim

      clip.inPointMicros = newInPointMicros
      clip.durationMicros = trimmedDuration
      // startMicros stays the same; the clip visually doesn't move, but its source point changes
      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Trim the end of a clip by adjusting its outPointMicros and durationMicros.
 * newOutPointMicros should be > inPointMicros and <= asset duration (if applicable).
 * The clip's visual end position changes; startMicros unchanged.
 */
export function trimClipEnd(
  clipId: string,
  newOutPointMicros: Micros,
  _fps: number  // Currently unused; reserved for frame-snapping future enhancements
): Command {
  return {
    name: 'TrimClipEnd',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      const newDuration = newOutPointMicros - clip.inPointMicros

      if (newDuration <= 0) return // Invalid trim

      clip.outPointMicros = newOutPointMicros
      clip.durationMicros = newDuration
      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Split a clip at a given time, creating two clips.
 * timeMicros must be between clip.startMicros and clip.startMicros + clip.durationMicros.
 */
export function splitClip(
  clipId: string,
  timeMicros: Micros,
  _fps: number  // Currently unused; reserved for frame-snapping future enhancements
): Command {
  return {
    name: 'SplitClip',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      const clipEnd = clip.startMicros + clip.durationMicros
      if (timeMicros <= clip.startMicros || timeMicros >= clipEnd) return // Out of bounds

      const track = draft.tracks.find((t) => t.id === clip.trackId)
      if (!track) return

      // Calculate split point as offset into clip source
      const splitOffsetInClip = timeMicros - clip.startMicros
      const newInPoint = clip.inPointMicros + splitOffsetInClip

      // Left clip: unchanged except shorter duration
      const leftDuration = splitOffsetInClip
      clip.durationMicros = leftDuration
      clip.outPointMicros = newInPoint

      // Right clip: same asset, starts at split point
      const rightClip = createClip(
        clip.trackId,
        clip.assetId,
        timeMicros,
        clipEnd - timeMicros,
        newInPoint
      )
      rightClip.speed = clip.speed
      rightClip.volume = clip.volume
      rightClip.muted = clip.muted
      rightClip.fadeInMicros = 0 // Reset fades at split
      rightClip.fadeOutMicros = clip.fadeOutMicros
      rightClip.transform = { ...clip.transform }
      rightClip.effects = JSON.parse(JSON.stringify(clip.effects))
      rightClip.keyframes = JSON.parse(JSON.stringify(clip.keyframes))

      // Insert right clip after left
      const clipIdx = track.clips.indexOf(clip)
      track.clips.splice(clipIdx + 1, 0, rightClip)

      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Delete a clip from its track.
 */
export function deleteClip(clipId: string): Command {
  return {
    name: 'DeleteClip',
    recipe: (draft) => {
      for (const track of draft.tracks) {
        const idx = track.clips.findIndex((c) => c.id === clipId)
        if (idx !== -1) {
          track.clips.splice(idx, 1)
          draft.modifiedAt = Date.now()
          return
        }
      }
    },
  }
}

/**
 * Duplicate a clip right after the original.
 */
export function duplicateClip(clipId: string, _fps: number): Command {
  return {
    name: 'DuplicateClip',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      const track = draft.tracks.find((t) => t.id === clip.trackId)
      if (!track) return

      // Create a deep copy
      const newClip: Clip = {
        id: createId(),
        trackId: clip.trackId,
        assetId: clip.assetId,
        startMicros: clip.startMicros + clip.durationMicros,
        durationMicros: clip.durationMicros,
        inPointMicros: clip.inPointMicros,
        outPointMicros: clip.outPointMicros,
        speed: clip.speed,
        volume: clip.volume,
        muted: clip.muted,
        fadeInMicros: clip.fadeInMicros,
        fadeOutMicros: clip.fadeOutMicros,
        transform: { ...clip.transform },
        effects: JSON.parse(JSON.stringify(clip.effects)),
        keyframes: JSON.parse(JSON.stringify(clip.keyframes)),
        transitionOut: clip.transitionOut
          ? { ...clip.transitionOut }
          : undefined,
        text: clip.text ? { ...clip.text } : undefined,
      }

      // Insert after original
      const clipIdx = track.clips.indexOf(clip)
      track.clips.splice(clipIdx + 1, 0, newClip)

      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Helper: find a clip by ID across all tracks.
 */
function findClipById(draft: any, clipId: string): Clip | null {
  for (const track of draft.tracks) {
    const clip = track.clips.find((c: Clip) => c.id === clipId)
    if (clip) return clip
  }
  return null
}
