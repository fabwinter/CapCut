import type { Transform } from '../schema'
import type { Command } from './types'

/** Patches a clip's transform (position/scale/rotation/opacity) — e.g. drag/pinch on the preview canvas. */
export function setClipTransform(clipId: string, patch: Partial<Transform>): Command {
  return {
    name: 'SetClipTransform',
    recipe: (draft) => {
      for (const track of draft.tracks) {
        const clip = track.clips.find((c) => c.id === clipId)
        if (!clip) continue
        let changed = false
        for (const key of Object.keys(patch) as (keyof Transform)[]) {
          const value = patch[key]
          if (value !== undefined && clip.transform[key] !== value) {
            clip.transform[key] = value
            changed = true
          }
        }
        if (changed) draft.modifiedAt = Date.now()
        return
      }
    },
  }
}
