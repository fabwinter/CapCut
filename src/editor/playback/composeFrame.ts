import { findActiveClips } from '#/editor/doc/selectors/activeClips'
import { evaluateKeyframedValue } from '#/editor/doc/selectors/keyframes'
import { findAdjacentNextClip } from '#/editor/doc/selectors/transitions'
import type { Clip, Effect, ProjectDoc, Transform } from '#/editor/doc/schema'
import type { Micros } from '#/editor/doc/time'
import { computeAdjustments, computeLutSelection, NEUTRAL_ADJUSTMENTS } from './compositor/adjustments'
import type { Compositor } from './compositor/gl'
import { loadLutBitmap } from './compositor/lutStore'
import { computeTextAnimationModifier } from './compositor/textAnimation'
import { rasterizeText } from './compositor/textRasterizer'
import { computeQuadCorners, type Quad } from './compositor/transform2d'
import { computeTransitionBlend } from './compositor/transitionBlend'
import type { FrameSourceManager } from './frameSource'

/** Best-effort LUT bitmap fetch — a missing/failed LUT just renders without it rather than breaking the frame. */
async function resolveLut(effects: Effect[]) {
  const selection = computeLutSelection(effects)
  if (!selection) return undefined
  try {
    const bitmap = await loadLutBitmap(selection.lutId)
    return { id: selection.lutId, bitmap, intensity: selection.intensity }
  } catch {
    return undefined
  }
}

function hexToRgb01(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex)
  if (!m) return [0, 0, 0]
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255]
}

let blackSource: OffscreenCanvas | undefined
function getBlackSource(): OffscreenCanvas {
  if (!blackSource) {
    const canvas = new OffscreenCanvas(2, 2)
    canvas.getContext('2d')?.fillRect(0, 0, 2, 2)
    blackSource = canvas
  }
  return blackSource
}

export interface ComposeFrameResources {
  getProxyFile(assetId: string): Promise<File>
  getImageBitmap(assetId: string): Promise<ImageBitmap>
  frameSources: FrameSourceManager
  transformOverrides?: Map<string, Partial<Transform>>
  /** Checked after every await — if it returns true, composition bails out without touching the canvas (a newer call superseded this one). Omit for sequential, non-racing callers like the exporter. */
  isStale?: () => boolean
  /**
   * A clip that should be visible produced nothing to draw — a decode
   * failure/timeout, a thrown exception, or similar. Without this, those
   * failures were silently swallowed (console.error at best) and the canvas
   * just stayed on whatever it last drew, indistinguishable from "still
   * loading" or a layout bug. Not called for expected non-failures (asset
   * still importing, clip has no media, etc).
   */
  onClipError?: (clipId: string, message: string) => void
  /**
   * Fires once per completed (non-stale) composeFrame call with whether any
   * clip errored this frame — lets a caller clear a previously-shown error
   * banner exactly when a frame actually finishes drawing cleanly, instead
   * of on every animation-frame tick regardless of whether this frame's
   * render even succeeded.
   */
  onFrameRendered?: (hadError: boolean) => void
}

async function resolveClipSource(
  doc: ProjectDoc,
  clip: Clip,
  localMicros: Micros,
  framesToClose: VideoFrame[],
  resources: ComposeFrameResources,
  reportClipError: (clipId: string, message: string) => void,
): Promise<{ source: TexImageSource; width: number; height: number } | undefined> {
  if (!clip.assetId) return undefined
  const asset = doc.assets.find((a) => a.id === clip.assetId)
  if (!asset || asset.status !== 'ready') return undefined

  if (asset.kind === 'image') {
    const bitmap = await resources.getImageBitmap(asset.id)
    return { source: bitmap, width: bitmap.width, height: bitmap.height }
  }
  if (asset.kind === 'video' && asset.proxy) {
    const file = await resources.getProxyFile(asset.id)
    const frame = await resources.frameSources.getFrame(asset.id, file, localMicros, resources.isStale)
    if (!frame) {
      if (!resources.isStale?.()) {
        reportClipError(clip.id, 'Video frame could not be decoded (timed out or the decoder reported an error).')
      }
      return undefined
    }
    framesToClose.push(frame)
    return { source: frame, width: frame.codedWidth, height: frame.codedHeight }
  }
  return undefined
}

/**
 * Composes every visible clip at `atMicros` (keyframes, adjustments,
 * transitions, text) and draws them to `compositor`. Shared by `Transport`
 * (live preview, which races scrub/edit calls against each other via
 * `isStale`) and the exporter (a strictly sequential frame loop that never
 * races) — the single place this logic exists, so export renders identically
 * to preview by construction.
 */
export async function composeFrame(
  compositor: Compositor,
  doc: ProjectDoc,
  atMicros: Micros,
  resources: ComposeFrameResources,
): Promise<void> {
  const stale = () => resources.isStale?.() ?? false
  const [r, g, b] = hexToRgb01(doc.settings.background)
  let hadError = false
  const reportClipError = (clipId: string, message: string) => {
    hadError = true
    resources.onClipError?.(clipId, message)
  }

  const active = findActiveClips(doc, atMicros)
  const framesToClose: VideoFrame[] = []
  const draws: {
    slotKey: string
    source: TexImageSource
    quad: Quad
    opacity: number
    adjustments: ReturnType<typeof computeAdjustments>
    lut?: Awaited<ReturnType<typeof resolveLut>>
    scissor?: { x: number; y: number; width: number; height: number }
  }[] = []

  for (const { clip, track, clipLocalMicros, localMicros } of active) {
    if (track.kind === 'audio') continue
    try {
      const keyframedTransform: Transform =
        clip.keyframes.length === 0
          ? clip.transform
          : {
              x: evaluateKeyframedValue(clip.keyframes, 'x', clipLocalMicros, clip.transform.x),
              y: evaluateKeyframedValue(clip.keyframes, 'y', clipLocalMicros, clip.transform.y),
              scale: evaluateKeyframedValue(clip.keyframes, 'scale', clipLocalMicros, clip.transform.scale),
              rotation: evaluateKeyframedValue(clip.keyframes, 'rotation', clipLocalMicros, clip.transform.rotation),
              opacity: evaluateKeyframedValue(clip.keyframes, 'opacity', clipLocalMicros, clip.transform.opacity),
            }
      const override = resources.transformOverrides?.get(clip.id)
      const transform = override ? { ...keyframedTransform, ...override } : keyframedTransform
      const adjustments = computeAdjustments(clip.effects)
      const lut = await resolveLut(clip.effects)
      if (stale()) return

      if (clip.text) {
        const raster = rasterizeText(clip.text, doc.settings.width, doc.settings.height)
        const mod = computeTextAnimationModifier(
          clip.text.animationIn,
          clip.text.animationOut,
          clipLocalMicros,
          clip.durationMicros,
          doc.settings.width,
        )
        const quad = computeQuadCorners(
          { ...transform, x: transform.x + mod.xOffsetPx, scale: transform.scale * mod.scaleMul },
          doc.settings.width,
          doc.settings.height,
          doc.settings.width,
          doc.settings.height,
        )
        draws.push({ slotKey: clip.id, source: raster, quad, opacity: transform.opacity * mod.opacityMul, adjustments, lut })
      } else {
        const resolved = await resolveClipSource(doc, clip, localMicros, framesToClose, resources, reportClipError)
        if (stale()) return
        if (resolved) {
          const quad = computeQuadCorners(transform, resolved.width, resolved.height, doc.settings.width, doc.settings.height)
          draws.push({ slotKey: clip.id, source: resolved.source, quad, opacity: transform.opacity, adjustments, lut })
        }
      }

      // Transition into the next clip on this track — see transitionBlend.ts for the hold-frame model.
      if (clip.transitionOut) {
        const transitionEnd = clip.startMicros + clip.durationMicros
        const transitionStart = transitionEnd - clip.transitionOut.durationMicros
        if (atMicros >= transitionStart) {
          const next = findAdjacentNextClip(doc, clip)
          if (next) {
            const progress =
              clip.transitionOut.durationMicros <= 0 ? 1 : (atMicros - transitionStart) / clip.transitionOut.durationMicros
            const blend = computeTransitionBlend(clip.transitionOut.type, progress, doc.settings.width, doc.settings.height)
            const lastDraw = draws.at(-1)
            if (lastDraw && lastDraw.slotKey === clip.id) lastDraw.opacity *= blend.opacityA

            if (blend.blackOverlayOpacity > 0) {
              draws.push({
                slotKey: '__transition_black',
                source: getBlackSource(),
                quad: computeQuadCorners(
                  { x: 0, y: 0, scale: 1, rotation: 0 },
                  doc.settings.width,
                  doc.settings.height,
                  doc.settings.width,
                  doc.settings.height,
                ),
                opacity: blend.blackOverlayOpacity,
                adjustments: NEUTRAL_ADJUSTMENTS,
              })
            }

            const nextResolved = next.text
              ? { source: rasterizeText(next.text, doc.settings.width, doc.settings.height), width: doc.settings.width, height: doc.settings.height }
              : await resolveClipSource(doc, next, next.inPointMicros, framesToClose, resources, reportClipError)
            if (stale()) return
            if (nextResolved) {
              const nextQuad = computeQuadCorners(
                next.transform,
                nextResolved.width,
                nextResolved.height,
                doc.settings.width,
                doc.settings.height,
              ).map((p) => ({ x: p.x + blend.xOffsetB, y: p.y })) as Quad
              const nextLut = await resolveLut(next.effects)
              if (stale()) return
              draws.push({
                slotKey: `${next.id}:transition-in`,
                source: nextResolved.source,
                quad: nextQuad,
                opacity: next.transform.opacity * blend.opacityB,
                adjustments: computeAdjustments(next.effects),
                lut: nextLut,
                scissor: blend.scissorB,
              })
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to render clip', clip.id, err)
      reportClipError(clip.id, err instanceof Error ? err.message : String(err))
    }
  }

  if (stale()) {
    for (const frame of framesToClose) frame.close()
    return
  }

  compositor.clear(r, g, b, 1)
  for (const draw of draws) {
    // Per-draw catch: a throwing draw (e.g. a texture upload the browser
    // rejects) must not kill the rest of the frame — and it MUST reach the
    // error banner. This loop sat outside the per-clip try/catch above, so
    // a failure here used to reject the whole composeFrame promise with no
    // onClipError and no onFrameRendered: a permanently black canvas with
    // zero visible diagnostics.
    try {
      if (draw.scissor) compositor.setScissor(draw.scissor.x, draw.scissor.y, draw.scissor.width, draw.scissor.height)
      compositor.drawLayer(draw.slotKey, draw.source, draw.quad, draw.opacity, draw.adjustments, draw.lut)
    } catch (err) {
      console.error('Failed to draw layer', draw.slotKey, err)
      reportClipError(draw.slotKey, err instanceof Error ? err.message : String(err))
    } finally {
      if (draw.scissor) compositor.clearScissor()
    }
  }
  for (const frame of framesToClose) frame.close()
  resources.onFrameRendered?.(hadError)
}
