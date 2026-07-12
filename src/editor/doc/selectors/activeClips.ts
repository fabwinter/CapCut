import type { Clip, ProjectDoc, Track } from '../schema'
import type { Micros } from '../time'

export interface ActiveClip {
  clip: Clip
  track: Track
  /** Position inside the clip's *source* media, accounting for in-point and speed. */
  localMicros: Micros
  /** Position inside the *clip* itself (0 at the clip's timeline start), ignoring speed. */
  clipLocalMicros: Micros
}

/**
 * Every clip whose timeline span covers `atMicros`, in doc track order
 * (index 0 first) — the order the compositor draws bottom-up, so later
 * tracks land on top, matching the timeline's visual stacking.
 */
export function findActiveClips(doc: ProjectDoc, atMicros: Micros): ActiveClip[] {
  const active: ActiveClip[] = []
  for (const track of doc.tracks) {
    for (const clip of track.clips) {
      const clipLocalMicros = atMicros - clip.startMicros
      if (clipLocalMicros < 0 || clipLocalMicros >= clip.durationMicros) continue
      active.push({
        clip,
        track,
        clipLocalMicros,
        localMicros: clip.inPointMicros + clipLocalMicros * clip.speed,
      })
    }
  }
  return active
}
