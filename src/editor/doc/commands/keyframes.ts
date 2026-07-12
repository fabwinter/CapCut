import { createId, type Clip, type Easing, type KeyframableProperty } from '../schema'
import type { Micros } from '../time'
import type { Command } from './types'

function findClip(draft: { tracks: { clips: Clip[] }[] }, clipId: string): Clip | undefined {
  for (const track of draft.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return undefined
}

/** Adds a keyframe, or replaces the value/easing of one already at that exact time for the same property. */
export function addKeyframe(
  clipId: string,
  property: KeyframableProperty,
  atMicros: Micros,
  value: number,
  easing: Easing = 'linear',
): Command {
  return {
    name: 'AddKeyframe',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      if (!clip) return
      const clamped = Math.max(0, Math.min(clip.durationMicros, Math.round(atMicros)))
      const existing = clip.keyframes.find((k) => k.property === property && k.atMicros === clamped)
      if (existing) {
        existing.value = value
        existing.easing = easing
      } else {
        clip.keyframes.push({ id: createId(), property, atMicros: clamped, value, easing })
      }
      draft.modifiedAt = Date.now()
    },
  }
}

export function moveKeyframe(clipId: string, keyframeId: string, newAtMicros: Micros): Command {
  return {
    name: 'MoveKeyframe',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      const keyframe = clip?.keyframes.find((k) => k.id === keyframeId)
      if (!clip || !keyframe) return
      const clamped = Math.max(0, Math.min(clip.durationMicros, Math.round(newAtMicros)))
      if (clamped === keyframe.atMicros) return
      keyframe.atMicros = clamped
      draft.modifiedAt = Date.now()
    },
  }
}

export function updateKeyframeValue(clipId: string, keyframeId: string, value: number, easing?: Easing): Command {
  return {
    name: 'UpdateKeyframeValue',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      const keyframe = clip?.keyframes.find((k) => k.id === keyframeId)
      if (!clip || !keyframe) return
      if (keyframe.value === value && (easing === undefined || easing === keyframe.easing)) return
      keyframe.value = value
      if (easing !== undefined) keyframe.easing = easing
      draft.modifiedAt = Date.now()
    },
  }
}

export function deleteKeyframe(clipId: string, keyframeId: string): Command {
  return {
    name: 'DeleteKeyframe',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      if (!clip) return
      const before = clip.keyframes.length
      clip.keyframes = clip.keyframes.filter((k) => k.id !== keyframeId)
      if (clip.keyframes.length !== before) draft.modifiedAt = Date.now()
    },
  }
}
