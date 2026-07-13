import type { Clip, TextPayload } from '../schema'
import type { Command } from './types'

function findClip(draft: { tracks: { clips: Clip[] }[] }, clipId: string): Clip | undefined {
  for (const track of draft.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return undefined
}

/** Patches a text clip's content/style — a no-op on a clip with no `text` payload (e.g. a video clip). */
export function setClipText(clipId: string, patch: Partial<TextPayload>): Command {
  return {
    name: 'SetClipText',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      if (!clip?.text) return
      clip.text = { ...clip.text, ...patch }
      draft.modifiedAt = Date.now()
    },
  }
}
