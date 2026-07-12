import { findActiveClips } from '#/editor/doc/selectors/activeClips'
import type { Clip, ProjectDoc } from '#/editor/doc/schema'
import type { Micros } from '#/editor/doc/time'
import { computeQuadCorners, pointInQuad, type Point } from './compositor/transform2d'

/**
 * Source aspect ratio for a clip's on-canvas quad — geometry only, so
 * hit-testing (a UI concern) never needs a decoded frame. Text clips are
 * always canvas-sized; media clips use the asset's probed dimensions, which
 * share the proxy's aspect ratio even though the pixel counts differ.
 */
export function sourceDimensionsFor(
  doc: ProjectDoc,
  clip: Clip,
  canvasWidth: number,
  canvasHeight: number,
): { width: number; height: number } {
  if (clip.text) return { width: canvasWidth, height: canvasHeight }
  const asset = doc.assets.find((a) => a.id === clip.assetId)
  return { width: asset?.width ?? canvasWidth, height: asset?.height ?? canvasHeight }
}

/** Topmost visible clip whose quad contains `point` (canvas pixel space) at `atMicros`, if any. */
export function hitTestClip(
  doc: ProjectDoc,
  atMicros: Micros,
  point: Point,
  canvasWidth: number,
  canvasHeight: number,
): Clip | undefined {
  const active = findActiveClips(doc, atMicros).filter((a) => a.track.kind !== 'audio')
  for (let i = active.length - 1; i >= 0; i--) {
    const { clip } = active[i]
    const { width, height } = sourceDimensionsFor(doc, clip, canvasWidth, canvasHeight)
    const quad = computeQuadCorners(clip.transform, width, height, canvasWidth, canvasHeight)
    if (pointInQuad(point, quad)) return clip
  }
  return undefined
}
