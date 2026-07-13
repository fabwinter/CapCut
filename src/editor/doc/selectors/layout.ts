import type { ProjectDoc, Track, Clip } from '../schema'
import type { Micros } from '../time'
import { microsToSeconds, snapToFrame } from '../time'

/**
 * A clip positioned in screen space for rendering in the timeline.
 * startPx and widthPx are derived from the clip's startMicros and durationMicros
 * at a given pxPerSecond zoom level.
 */
export interface PositionedClip {
  clip: Clip
  track: Track
  startPx: number
  widthPx: number
  // Derived from clip's speed; used for trim handle rendering
  speedFactor: number
}

/**
 * A track with clips positioned for rendering.
 */
export interface PositionedTrack {
  track: Track
  clips: PositionedClip[]
}

/**
 * Convert doc + zoom level into positioned clips for timeline rendering.
 * @param doc The project document
 * @param pxPerSecond Pixels per second zoom level (e.g., 100 = 100px for 1 second)
 * @returns Array of positioned tracks with positioned clips
 */
export function docToLanes(doc: ProjectDoc, pxPerSecond: number): PositionedTrack[] {
  return doc.tracks.map((track) => ({
    track,
    clips: track.clips.map((clip) => ({
      clip,
      track,
      startPx: secondsToPixels(microsToSeconds(clip.startMicros), pxPerSecond),
      widthPx: secondsToPixels(
        microsToSeconds(clip.durationMicros),
        pxPerSecond
      ),
      speedFactor: clip.speed,
    })),
  }))
}

/**
 * Find the clip at a given pixel offset on a specific track.
 * Returns the first clip whose rect contains the pixel (left-to-right ordering).
 */
export function findClipAtPixel(
  track: PositionedTrack,
  pixelX: number
): PositionedClip | null {
  for (const pclip of track.clips) {
    if (pixelX >= pclip.startPx && pixelX < pclip.startPx + pclip.widthPx) {
      return pclip
    }
  }
  return null
}

/**
 * Find the trim handle (left or right edge) of a clip if pixelX is within the hit zone.
 * @param pclip Positioned clip
 * @param pixelX X coordinate in timeline space
 * @param trimHandleWidthPx Width of the trim handle hit zone (default 12px)
 * @returns 'in' (left edge), 'out' (right edge), or null
 */
export function findTrimHandle(
  pclip: PositionedClip,
  pixelX: number,
  trimHandleWidthPx: number = 12
): 'in' | 'out' | null {
  const left = pclip.startPx
  const right = pclip.startPx + pclip.widthPx

  if (pixelX >= left && pixelX < left + trimHandleWidthPx) return 'in'
  if (pixelX > right - trimHandleWidthPx && pixelX <= right) return 'out'
  return null
}

/**
 * Helper: convert screen pixels to timeline microseconds.
 * @param pixels Pixel offset
 * @param pxPerSecond Zoom level (pixels per second)
 * @param fps Project fps for snapping
 * @returns Time in microseconds
 */
export function pixelsToMicros(
  pixels: number,
  pxPerSecond: number,
  fps: number
): Micros {
  const seconds = pixels / pxPerSecond
  return snapToFrame(Math.round(seconds * 1_000_000), fps)
}

/**
 * Helper: convert timeline microseconds to screen pixels.
 */
export function microsToPixels(micros: Micros, pxPerSecond: number): number {
  return secondsToPixels(microsToSeconds(micros), pxPerSecond)
}

function secondsToPixels(seconds: number, pxPerSecond: number): number {
  return seconds * pxPerSecond
}

/**
 * Find clips that overlap a given time range. Used for ripple edits and selection.
 * @param track Track to search
 * @param startMicros Start of range
 * @param endMicros End of range (exclusive)
 */
export function findClipsInTimeRange(
  track: Track,
  startMicros: Micros,
  endMicros: Micros
): Clip[] {
  return track.clips.filter((clip) => {
    const clipEnd = clip.startMicros + clip.durationMicros
    // Overlaps if: clip.start < range.end AND clip.end > range.start
    return clip.startMicros < endMicros && clipEnd > startMicros
  })
}

/**
 * Calculate the screen position (px from left) of a playhead at a given time.
 */
export function timeToPlayheadPosition(
  timeMicros: Micros,
  pxPerSecond: number
): number {
  return microsToPixels(timeMicros, pxPerSecond)
}
