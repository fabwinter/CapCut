import type { Clip, Transition } from '../schema'
import type { Command } from './types'

function findClip(draft: { tracks: { clips: Clip[] }[] }, clipId: string): Clip | undefined {
  for (const track of draft.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return undefined
}

/** Sets or clears the transition blending a clip into whatever clip immediately follows it on its track. */
export function setTransitionOut(clipId: string, transition: Transition | null): Command {
  return {
    name: 'SetTransitionOut',
    recipe: (draft) => {
      const clip = findClip(draft, clipId)
      if (!clip) return
      if (transition === null) {
        if (clip.transitionOut === undefined) return
        clip.transitionOut = undefined
      } else {
        clip.transitionOut = transition
      }
      draft.modifiedAt = Date.now()
    },
  }
}
