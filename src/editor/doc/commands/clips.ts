import { createDefaultTransform, createId, type Clip, type Keyframe } from '../schema'
import type { Command } from './types'

/** Floor under which a trim/split can't shrink a clip — half a frame at 60fps. */
const MIN_CLIP_DURATION_MICROS = 8_333

/**
 * Keyframes and fade durations are stored relative to the clip's own
 * timeline (0 = clip start), not the source. Every command that moves the
 * start, shrinks the duration, or rescales the clip must keep them in sync
 * — otherwise a keyframe silently drifts to a different visual moment, or a
 * fade rides past the edge it was anchored to.
 */

/** Trimming the start moves clip-local zero forward by `deltaMicros` — shift keyframes to match, dropping any now before the new start or past the new end. */
function shiftKeyframesForStartTrim(keyframes: Keyframe[], deltaMicros: number, newDurationMicros: number): Keyframe[] {
  return keyframes
    .map((kf) => ({ ...kf, atMicros: kf.atMicros - deltaMicros }))
    .filter((kf) => kf.atMicros >= 0 && kf.atMicros <= newDurationMicros)
}

/** Drops keyframes that now fall past a shortened end. */
function clampKeyframesToDuration(keyframes: Keyframe[], newDurationMicros: number): Keyframe[] {
  return keyframes.filter((kf) => kf.atMicros <= newDurationMicros)
}

/** Speed changes rescale the clip's timeline — keyframes and fades must scale by the same factor to stay at the same proportional (and source-content) position. */
export function scaleClipLocalTiming(clip: Clip, scale: number): void {
  clip.keyframes = clip.keyframes.map((kf) => ({ ...kf, atMicros: Math.round(kf.atMicros * scale) }))
  clip.fadeInMicros = Math.round(clip.fadeInMicros * scale)
  clip.fadeOutMicros = Math.round(clip.fadeOutMicros * scale)
}

export interface CreateClipParams {
  trackId: string
  assetId?: string
  startMicros: number
  durationMicros: number
  inPointMicros?: number
  text?: Clip['text']
}

/** Builds a new clip with editor defaults — callers only specify what differs. */
export function createClip(params: CreateClipParams): Clip {
  return {
    id: createId(),
    trackId: params.trackId,
    assetId: params.assetId,
    startMicros: params.startMicros,
    durationMicros: params.durationMicros,
    inPointMicros: params.inPointMicros ?? 0,
    speed: 1,
    volume: 1,
    muted: false,
    fadeInMicros: 0,
    fadeOutMicros: 0,
    transform: createDefaultTransform(),
    effects: [],
    keyframes: [],
    text: params.text,
  }
}

export function addClip(clip: Clip): Command {
  return {
    name: 'AddClip',
    recipe: (draft) => {
      const track = draft.tracks.find((t) => t.id === clip.trackId)
      if (!track) return
      track.clips.push(clip)
      draft.modifiedAt = Date.now()
    },
  }
}

/** Moves a clip to a new start time and/or track (drag-to-move, including cross-track). */
export function moveClip(clipId: string, target: { trackId: string; startMicros: number }): Command {
  return {
    name: 'MoveClip',
    recipe: (draft) => {
      const destTrack = draft.tracks.find((t) => t.id === target.trackId)
      if (!destTrack) return
      const startMicros = Math.max(0, Math.round(target.startMicros))
      let clip: Clip | undefined
      for (const track of draft.tracks) {
        clip = track.clips.find((c) => c.id === clipId)
        if (clip) {
          if (track.id === target.trackId && clip.startMicros === startMicros) return
          track.clips = track.clips.filter((c) => c.id !== clipId)
          break
        }
      }
      if (!clip) return
      clip.trackId = target.trackId
      clip.startMicros = startMicros
      destTrack.clips.push(clip)
      draft.modifiedAt = Date.now()
    },
  }
}

/** Drags the clip's left edge — keeps the right edge fixed, adjusts the source in-point. */
export function trimClipStart(clipId: string, newStartMicros: number): Command {
  return {
    name: 'TrimClipStart',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      if (!clip) return
      const endMicros = clip.startMicros + clip.durationMicros
      const clampedStart = Math.max(
        0,
        Math.min(Math.round(newStartMicros), endMicros - MIN_CLIP_DURATION_MICROS),
      )
      const deltaMicros = clampedStart - clip.startMicros
      if (deltaMicros === 0) return
      const deltaSourceMicros = deltaMicros * clip.speed
      if (clip.inPointMicros + deltaSourceMicros < 0) return
      const newDuration = endMicros - clampedStart
      clip.startMicros = clampedStart
      clip.durationMicros = newDuration
      clip.inPointMicros += deltaSourceMicros
      clip.keyframes = shiftKeyframesForStartTrim(clip.keyframes, deltaMicros, newDuration)
      clip.fadeInMicros = Math.max(0, Math.min(clip.fadeInMicros - deltaMicros, newDuration))
      draft.modifiedAt = Date.now()
    },
  }
}

/** Drags the clip's right edge — start and in-point stay fixed. */
export function trimClipEnd(clipId: string, newEndMicros: number): Command {
  return {
    name: 'TrimClipEnd',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      if (!clip) return
      const newDuration = Math.max(
        MIN_CLIP_DURATION_MICROS,
        Math.round(newEndMicros) - clip.startMicros,
      )
      if (newDuration === clip.durationMicros) return
      const removedFromEnd = Math.max(0, clip.durationMicros - newDuration)
      clip.durationMicros = newDuration
      if (clip.outPointMicros !== undefined) {
        clip.outPointMicros = clip.inPointMicros + newDuration * clip.speed
      }
      clip.keyframes = clampKeyframesToDuration(clip.keyframes, newDuration)
      clip.fadeOutMicros = Math.max(0, Math.min(clip.fadeOutMicros - removedFromEnd, newDuration))
      draft.modifiedAt = Date.now()
    },
  }
}

/** Splits one clip into two at an absolute timeline position; each half keeps undo as one step. */
export function splitClip(clipId: string, atMicros: number): Command {
  return {
    name: 'SplitClip',
    recipe: (draft) => {
      const track = draft.tracks.find((t) => t.clips.some((c) => c.id === clipId))
      const clip = track?.clips.find((c) => c.id === clipId)
      if (!track || !clip) return
      const at = Math.round(atMicros)
      const firstDuration = at - clip.startMicros
      const secondDuration = clip.durationMicros - firstDuration
      if (firstDuration < MIN_CLIP_DURATION_MICROS || secondDuration < MIN_CLIP_DURATION_MICROS) return

      const secondClip: Clip = {
        ...clip,
        id: createId(),
        startMicros: at,
        durationMicros: secondDuration,
        inPointMicros: clip.inPointMicros + firstDuration * clip.speed,
        outPointMicros:
          clip.outPointMicros !== undefined ? clip.outPointMicros : undefined,
        effects: clip.effects.map((effect) => ({ ...effect, id: createId() })),
        keyframes: clip.keyframes
          .filter((kf) => kf.atMicros >= firstDuration)
          .map((kf) => ({ ...kf, id: createId(), atMicros: kf.atMicros - firstDuration })),
        transitionOut: clip.transitionOut,
        fadeInMicros: 0,
      }

      clip.durationMicros = firstDuration
      if (clip.outPointMicros !== undefined) {
        clip.outPointMicros = clip.inPointMicros + firstDuration * clip.speed
      }
      clip.keyframes = clip.keyframes.filter((kf) => kf.atMicros < firstDuration)
      clip.transitionOut = undefined
      clip.fadeOutMicros = 0

      const insertAt = track.clips.findIndex((c) => c.id === clipId) + 1
      track.clips.splice(insertAt, 0, secondClip)
      draft.modifiedAt = Date.now()
    },
  }
}

export function duplicateClip(clipId: string): Command {
  return {
    name: 'DuplicateClip',
    recipe: (draft) => {
      const track = draft.tracks.find((t) => t.clips.some((c) => c.id === clipId))
      const clip = track?.clips.find((c) => c.id === clipId)
      if (!track || !clip) return
      const copy: Clip = {
        ...clip,
        id: createId(),
        startMicros: clip.startMicros + clip.durationMicros,
        effects: clip.effects.map((effect) => ({ ...effect, id: createId() })),
        keyframes: clip.keyframes.map((kf) => ({ ...kf, id: createId() })),
      }
      track.clips.push(copy)
      draft.modifiedAt = Date.now()
    },
  }
}

export interface DeleteClipOptions {
  /** Shift every later clip on the same track left to close the gap. */
  ripple?: boolean
}

export function deleteClip(clipId: string, options: DeleteClipOptions = {}): Command {
  return {
    name: 'DeleteClip',
    recipe: (draft) => {
      const track = draft.tracks.find((t) => t.clips.some((c) => c.id === clipId))
      const clip = track?.clips.find((c) => c.id === clipId)
      if (!track || !clip) return
      track.clips = track.clips.filter((c) => c.id !== clipId)
      if (options.ripple) {
        const removedEnd = clip.startMicros + clip.durationMicros
        for (const other of track.clips) {
          if (other.startMicros >= removedEnd) {
            other.startMicros -= clip.durationMicros
          }
        }
      }
      draft.modifiedAt = Date.now()
    },
  }
}

function findClip(draft: { tracks: { clips: Clip[] }[] }, clipId: string): Clip | undefined {
  for (const track of draft.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return undefined
}
