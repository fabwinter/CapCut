import type { Clip, ProjectDoc } from '../schema'

/** The clip immediately following `clip` on the same track — starts exactly when `clip` ends, if any. */
export function findAdjacentNextClip(doc: ProjectDoc, clip: Clip): Clip | undefined {
  const track = doc.tracks.find((t) => t.clips.some((c) => c.id === clip.id))
  if (!track) return undefined
  const end = clip.startMicros + clip.durationMicros
  return track.clips.find((c) => c.startMicros === end)
}
