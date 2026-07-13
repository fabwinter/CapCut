import { evaluateKeyframedValue } from '#/editor/doc/selectors/keyframes'
import type { Clip } from '#/editor/doc/schema'
import type { Micros } from '#/editor/doc/time'

export interface GainEnvelopePoint {
  /** Seconds after the audio source starts playing (always >= 0). */
  atSeconds: number
  value: number
  /** false = jump to this value (`setValueAtTime`), true = ramp to it (`linearRampToValueAtTime`). */
  ramp: boolean
}

type FadeableClip = Pick<Clip, 'volume' | 'muted' | 'fadeInMicros' | 'fadeOutMicros' | 'durationMicros' | 'keyframes'>

/**
 * The volume-over-time envelope for one clip's fade in/out (and any
 * keyframed volume), clipped to whatever portion actually gets played
 * (`startLocalMicros` is how far into the clip's own timeline the audio
 * source begins — nonzero when playback starts mid-clip). Pure function;
 * `Transport` feeds these points straight to a `GainNode`'s `AudioParam`
 * schedule.
 */
export function computeGainEnvelope(clip: FadeableClip, startLocalMicros: Micros): GainEnvelopePoint[] {
  const hasVolumeKeyframes = clip.keyframes.some((k) => k.property === 'volume')
  const fadeInEndSec = clip.fadeInMicros / 1_000_000
  const fadeOutStartSec = (clip.durationMicros - clip.fadeOutMicros) / 1_000_000
  const fadeOutEndSec = clip.durationMicros / 1_000_000
  const startSec = startLocalMicros / 1_000_000

  function baseVolumeAt(tSec: number): number {
    if (clip.muted) return 0
    if (!hasVolumeKeyframes) return clip.volume
    return evaluateKeyframedValue(clip.keyframes, 'volume', Math.round(tSec * 1_000_000), clip.volume)
  }

  function valueAt(tSec: number): number {
    const target = baseVolumeAt(tSec)
    if (clip.fadeInMicros > 0 && tSec < fadeInEndSec) return target * (tSec / fadeInEndSec)
    if (clip.fadeOutMicros > 0 && tSec > fadeOutStartSec) {
      const progress = (tSec - fadeOutStartSec) / Math.max(1e-9, fadeOutEndSec - fadeOutStartSec)
      return target * Math.max(0, 1 - progress)
    }
    return target
  }

  const points: GainEnvelopePoint[] = [{ atSeconds: 0, value: valueAt(startSec), ramp: false }]

  if (clip.fadeInMicros > 0 && fadeInEndSec > startSec) {
    points.push({ atSeconds: fadeInEndSec - startSec, value: valueAt(fadeInEndSec), ramp: true })
  }
  if (clip.fadeOutMicros > 0) {
    if (fadeOutStartSec > startSec) {
      points.push({ atSeconds: fadeOutStartSec - startSec, value: valueAt(fadeOutStartSec), ramp: false })
    }
    points.push({ atSeconds: Math.max(0, fadeOutEndSec - startSec), value: valueAt(fadeOutEndSec), ramp: true })
  }

  // Insert a ramp point for every volume keyframe in the playable range so the
  // schedule actually bends at each one, not just at the fade boundaries.
  if (hasVolumeKeyframes) {
    const existingTimes = new Set(points.map((p) => p.atSeconds))
    for (const kf of clip.keyframes) {
      if (kf.property !== 'volume') continue
      const rel = kf.atMicros / 1_000_000 - startSec
      if (rel <= 0 || rel >= fadeOutEndSec - startSec || existingTimes.has(rel)) continue
      points.push({ atSeconds: rel, value: valueAt(kf.atMicros / 1_000_000), ramp: true })
      existingTimes.add(rel)
    }
    points.sort((a, b) => a.atSeconds - b.atSeconds)
  }

  return points
}
