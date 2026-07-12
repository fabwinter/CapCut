import type { Clip } from '#/editor/doc/schema'
import type { Micros } from '#/editor/doc/time'

export interface GainEnvelopePoint {
  /** Seconds after the audio source starts playing (always >= 0). */
  atSeconds: number
  value: number
  /** false = jump to this value (`setValueAtTime`), true = ramp to it (`linearRampToValueAtTime`). */
  ramp: boolean
}

type FadeableClip = Pick<Clip, 'volume' | 'muted' | 'fadeInMicros' | 'fadeOutMicros' | 'durationMicros'>

/**
 * The volume-over-time envelope for one clip's fade in/out, clipped to
 * whatever portion actually gets played (`startLocalMicros` is how far into
 * the clip's own timeline the audio source begins — nonzero when playback
 * starts mid-clip). Pure function; `Transport` feeds these points straight
 * to a `GainNode`'s `AudioParam` schedule.
 */
export function computeGainEnvelope(clip: FadeableClip, startLocalMicros: Micros): GainEnvelopePoint[] {
  const target = clip.muted ? 0 : clip.volume
  const fadeInEndSec = clip.fadeInMicros / 1_000_000
  const fadeOutStartSec = (clip.durationMicros - clip.fadeOutMicros) / 1_000_000
  const fadeOutEndSec = clip.durationMicros / 1_000_000
  const startSec = startLocalMicros / 1_000_000

  function valueAt(tSec: number): number {
    if (clip.fadeInMicros > 0 && tSec < fadeInEndSec) return target * (tSec / fadeInEndSec)
    if (clip.fadeOutMicros > 0 && tSec > fadeOutStartSec) {
      const progress = (tSec - fadeOutStartSec) / Math.max(1e-9, fadeOutEndSec - fadeOutStartSec)
      return target * Math.max(0, 1 - progress)
    }
    return target
  }

  const points: GainEnvelopePoint[] = [{ atSeconds: 0, value: valueAt(startSec), ramp: false }]

  if (clip.fadeInMicros > 0 && fadeInEndSec > startSec) {
    points.push({ atSeconds: fadeInEndSec - startSec, value: target, ramp: true })
  }
  if (clip.fadeOutMicros > 0) {
    if (fadeOutStartSec > startSec) {
      points.push({ atSeconds: fadeOutStartSec - startSec, value: target, ramp: false })
    }
    points.push({ atSeconds: Math.max(0, fadeOutEndSec - startSec), value: 0, ramp: true })
  }

  return points
}
