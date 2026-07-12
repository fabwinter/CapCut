import { createId, type EffectType } from '../schema'
import type { Command } from './types'
import type { Clip } from '../schema'

function findClip(draft: { tracks: { clips: Clip[] }[] }, clipId: string): Clip | undefined {
  for (const track of draft.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return undefined
}

/**
 * Adjust panel sliders (brightness/contrast/saturation/temperature/vignette)
 * map 1:1 to at-most-one `Effect` of that type per clip — setting a slider
 * back to its neutral value removes the effect entirely rather than storing
 * a no-op, so a clip with no adjustments has an empty `effects` array.
 */
export function setAdjustment(clipId: string, type: EffectType, value: number, neutralValue: number): Command {
  return {
    name: 'SetAdjustment',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      if (!clip) return
      const index = clip.effects.findIndex((e) => e.type === type)

      if (value === neutralValue) {
        if (index === -1) return
        clip.effects.splice(index, 1)
        draft.modifiedAt = Date.now()
        return
      }

      if (index === -1) {
        clip.effects.push({ id: createId(), type, params: { value } })
      } else {
        if (clip.effects[index].params.value === value) return
        clip.effects[index].params.value = value
      }
      draft.modifiedAt = Date.now()
    },
  }
}

export function removeEffect(clipId: string, effectId: string): Command {
  return {
    name: 'RemoveEffect',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      if (!clip) return
      const before = clip.effects.length
      clip.effects = clip.effects.filter((e) => e.id !== effectId)
      if (clip.effects.length !== before) draft.modifiedAt = Date.now()
    },
  }
}
