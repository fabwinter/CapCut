import type { ProjectDoc, TrackKind } from '../schema'
import { microsToSeconds, secondsToMicros, type Micros } from '../time'

export const MIN_PX_PER_SECOND = 4
export const MAX_PX_PER_SECOND = 500
export const DEFAULT_PX_PER_SECOND = 60

/** Minimum on-screen width for a clip rect, so a very short clip stays tappable. */
const MIN_CLIP_WIDTH_PX = 6

const TRACK_HEIGHT_BY_KIND: Record<TrackKind, number> = {
  video: 64,
  overlay: 48,
  text: 40,
  audio: 40,
}

const TRACK_GAP_PX = 4

export function timeToPx(micros: Micros, pxPerSecond: number): number {
  return microsToSeconds(micros) * pxPerSecond
}

export function pxToTime(px: number, pxPerSecond: number): Micros {
  return secondsToMicros(px / pxPerSecond)
}

export function clampZoom(pxPerSecond: number): number {
  return Math.min(MAX_PX_PER_SECOND, Math.max(MIN_PX_PER_SECOND, pxPerSecond))
}

export interface ClipRect {
  clipId: string
  trackId: string
  assetId?: string
  x: number
  width: number
  startMicros: Micros
  durationMicros: Micros
}

export interface TrackLayout {
  trackId: string
  kind: TrackKind
  y: number
  height: number
  clips: ClipRect[]
}

export interface TimelineLayout {
  tracks: TrackLayout[]
  /** Total content width in px, covering every clip (never less than one screen-width unit). */
  contentWidthPx: number
  contentHeightPx: number
  pxPerSecond: number
}

/**
 * Doc -> positioned rects at a given zoom level. Pure and cheap enough to
 * recompute on every render; virtualization (which rects actually mount)
 * is a separate step via `visibleClipIds` so this stays a plain selector.
 */
export function computeTimelineLayout(doc: ProjectDoc, pxPerSecond: number): TimelineLayout {
  const zoom = clampZoom(pxPerSecond)
  let y = 0
  let contentWidthPx = 0
  const tracks: TrackLayout[] = doc.tracks.map((track) => {
    const height = TRACK_HEIGHT_BY_KIND[track.kind]
    const clips: ClipRect[] = track.clips.map((clip) => {
      const x = timeToPx(clip.startMicros, zoom)
      const width = Math.max(MIN_CLIP_WIDTH_PX, timeToPx(clip.durationMicros, zoom))
      contentWidthPx = Math.max(contentWidthPx, x + width)
      return {
        clipId: clip.id,
        trackId: track.id,
        assetId: clip.assetId,
        x,
        width,
        startMicros: clip.startMicros,
        durationMicros: clip.durationMicros,
      }
    })
    const layout: TrackLayout = { trackId: track.id, kind: track.kind, y, height, clips }
    y += height + TRACK_GAP_PX
    return layout
  })

  return { tracks, contentWidthPx, contentHeightPx: Math.max(0, y - TRACK_GAP_PX), pxPerSecond: zoom }
}

/** IDs of clips whose rect intersects a horizontal viewport window, with a scroll-ahead buffer. */
export function visibleClipIds(
  layout: TimelineLayout,
  viewportStartPx: number,
  viewportEndPx: number,
  bufferPx = 200,
): Set<string> {
  const lo = viewportStartPx - bufferPx
  const hi = viewportEndPx + bufferPx
  const ids = new Set<string>()
  for (const track of layout.tracks) {
    for (const clip of track.clips) {
      if (clip.x + clip.width >= lo && clip.x <= hi) ids.add(clip.clipId)
    }
  }
  return ids
}

export function findClipRect(layout: TimelineLayout, clipId: string): ClipRect | undefined {
  for (const track of layout.tracks) {
    const clip = track.clips.find((c) => c.clipId === clipId)
    if (clip) return clip
  }
  return undefined
}

export function findTrackAtY(layout: TimelineLayout, y: number): TrackLayout | undefined {
  return layout.tracks.find((t) => y >= t.y && y < t.y + t.height)
}
