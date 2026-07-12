import type { TextAnimation } from '#/editor/doc/schema'
import type { Micros } from '#/editor/doc/time'

/** In/out animations run over this much of the clip's start/end, capped so short clips don't overlap. */
const ANIMATION_DURATION_MICROS = 400_000

export interface TextAnimationModifier {
  opacityMul: number
  xOffsetPx: number
  scaleMul: number
}

function clamp01(t: number): number {
  return Math.min(1, Math.max(0, t))
}

/** Ease-out cubic — animation presets read as a snap-in/settle rather than linear. */
function easeOut(t: number): number {
  return 1 - (1 - t) ** 3
}

/**
 * How much a text clip's fade/slide/pop in/out preset should currently
 * offset its static raster, given how far into the clip playback is.
 * Pure function of clip-local time so it can be evaluated identically by
 * the live compositor and (later) the export renderer.
 */
export function computeTextAnimationModifier(
  animationIn: TextAnimation,
  animationOut: TextAnimation,
  localTimeMicros: Micros,
  clipDurationMicros: Micros,
  canvasWidthPx: number,
): TextAnimationModifier {
  const halfDuration = clipDurationMicros / 2
  const inDuration = Math.min(ANIMATION_DURATION_MICROS, halfDuration)
  const outDuration = Math.min(ANIMATION_DURATION_MICROS, halfDuration)
  const outStart = clipDurationMicros - outDuration

  let opacityMul = 1
  let xOffsetPx = 0
  let scaleMul = 1

  if (animationIn !== 'none' && localTimeMicros < inDuration) {
    const t = easeOut(clamp01(inDuration > 0 ? localTimeMicros / inDuration : 1))
    if (animationIn === 'fadeIn') opacityMul = t
    else if (animationIn === 'slideIn') xOffsetPx = (1 - t) * -canvasWidthPx * 0.3
    else if (animationIn === 'popIn') scaleMul = 0.6 + 0.4 * t
  }

  if (animationOut !== 'none' && localTimeMicros > outStart) {
    const t = easeOut(clamp01(outDuration > 0 ? (localTimeMicros - outStart) / outDuration : 1))
    if (animationOut === 'fadeIn') opacityMul = Math.min(opacityMul, 1 - t)
    else if (animationOut === 'slideIn') xOffsetPx += t * canvasWidthPx * 0.3
    else if (animationOut === 'popIn') scaleMul = Math.min(scaleMul, 1 - 0.4 * t)
  }

  return { opacityMul, xOffsetPx, scaleMul }
}
