import type { TransitionType } from '#/editor/doc/schema'

export interface TransitionBlend {
  /** Multiplier on the outgoing clip's normal opacity. */
  opacityA: number
  /** Multiplier on the incoming clip's normal opacity. */
  opacityB: number
  /** Added to the incoming clip's quad x position, in canvas px (slide). */
  xOffsetB: number
  /** Canvas-px rect the incoming clip is restricted to (wipe); undefined = unclipped. */
  scissorB?: { x: number; y: number; width: number; height: number }
  /** Opacity of a full-canvas black layer drawn between the two clips (dip to black). */
  blackOverlayOpacity: number
}

/**
 * Pure blend parameters for one instant of a transition, given how far
 * through it playback is (`progress` in [0, 1]). `Transport` supplies the
 * actual decoded frames and pixel geometry; this only decides how to
 * combine them, so it's testable without a GL context.
 *
 * Transitions in this editor are a *visual overlap*, not a timeline
 * overlap: the incoming clip's own timeline slot still starts right after
 * the outgoing clip ends. During the transition window we preview a frozen
 * hold of the incoming clip's very first frame — simpler than reshuffling
 * clip layout for a true crossfade, and seamless in practice since that
 * hold frame is exactly what plays next once the incoming clip's own slot
 * begins.
 */
export function computeTransitionBlend(
  type: TransitionType,
  progress: number,
  canvasWidth: number,
  canvasHeight: number,
): TransitionBlend {
  const t = Math.min(1, Math.max(0, progress))
  switch (type) {
    case 'crossDissolve':
      return { opacityA: 1 - t, opacityB: t, xOffsetB: 0, blackOverlayOpacity: 0 }
    case 'dipToBlack': {
      const outT = Math.min(1, t / 0.5)
      const inT = Math.max(0, (t - 0.5) / 0.5)
      const blackPeak = 1 - Math.abs(t - 0.5) * 2
      return { opacityA: 1 - outT, opacityB: inT, xOffsetB: 0, blackOverlayOpacity: Math.max(0, blackPeak) }
    }
    case 'slide':
      return { opacityA: 1, opacityB: 1, xOffsetB: (1 - t) * canvasWidth, blackOverlayOpacity: 0 }
    case 'wipe':
      return {
        opacityA: 1,
        opacityB: 1,
        xOffsetB: 0,
        scissorB: { x: 0, y: 0, width: canvasWidth * t, height: canvasHeight },
        blackOverlayOpacity: 0,
      }
    default:
      return { opacityA: 1 - t, opacityB: t, xOffsetB: 0, blackOverlayOpacity: 0 }
  }
}
