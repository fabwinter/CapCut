import type { Transform } from '#/editor/doc/schema'

/**
 * Pure 2D geometry for the compositor: clip transform -> quad corners in
 * canvas pixel space -> NDC. Kept free of WebGL/DOM so it's unit-testable;
 * `gl.ts` just feeds these numbers to the GPU.
 *
 * The canvas backing resolution is always exactly the project's
 * `settings.width/height` — there is no separate internal letterbox step;
 * CSS (`aspect-ratio` + `object-fit: contain` on the container) handles
 * fitting that fixed-aspect canvas into whatever panel size the device has.
 */

export interface Point {
  x: number
  y: number
}

export type Quad = [Point, Point, Point, Point]

/** Scale factor that makes a `sourceW x sourceH` rect fully cover a `targetW x targetH` rect. */
export function computeCoverScale(sourceW: number, sourceH: number, targetW: number, targetH: number): number {
  return Math.max(targetW / sourceW, targetH / sourceH)
}

/**
 * A clip's on-canvas quad, in canvas pixel space (origin top-left, Y-down —
 * matching how `transform.x/y` are authored). Default transform (x=y=0,
 * scale=1, rotation=0) covers the canvas fully, centered, CapCut-style.
 */
export function computeQuadCorners(
  transform: Pick<Transform, 'x' | 'y' | 'scale' | 'rotation'>,
  sourceW: number,
  sourceH: number,
  canvasW: number,
  canvasH: number,
): Quad {
  const coverScale = computeCoverScale(sourceW, sourceH, canvasW, canvasH)
  const scale = coverScale * transform.scale
  const w = sourceW * scale
  const h = sourceH * scale
  const cx = canvasW / 2 + transform.x
  const cy = canvasH / 2 + transform.y
  const rad = (transform.rotation * Math.PI) / 180
  const cos = Math.cos(rad)
  const sin = Math.sin(rad)

  const local: Point[] = [
    { x: -w / 2, y: -h / 2 },
    { x: w / 2, y: -h / 2 },
    { x: w / 2, y: h / 2 },
    { x: -w / 2, y: h / 2 },
  ]
  return local.map((p) => ({
    x: cx + p.x * cos - p.y * sin,
    y: cy + p.x * sin + p.y * cos,
  })) as Quad
}

/** Canvas pixel space (Y-down) -> WebGL clip space (Y-up), both in [-1, 1]. */
export function pxToNdc(p: Point, canvasW: number, canvasH: number): Point {
  return { x: (p.x / canvasW) * 2 - 1, y: 1 - (p.y / canvasH) * 2 }
}

/** Point-in-convex-quad test (same-side-of-every-edge), used for canvas tap-to-select hit testing. */
export function pointInQuad(p: Point, quad: Quad): boolean {
  let sign = 0
  for (let i = 0; i < 4; i++) {
    const a = quad[i]
    const b = quad[(i + 1) % 4]
    const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x)
    if (cross === 0) continue
    const s = Math.sign(cross)
    if (sign === 0) sign = s
    else if (s !== sign) return false
  }
  return true
}
