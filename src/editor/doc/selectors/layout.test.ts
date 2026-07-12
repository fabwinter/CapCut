import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import { addClip, createClip } from '../commands/clips'
import { CommandBus } from '../commands/bus'
import {
  clampZoom,
  computeTimelineLayout,
  findClipRect,
  findTrackAtY,
  MAX_PX_PER_SECOND,
  MIN_PX_PER_SECOND,
  pxToTime,
  timeToPx,
  visibleClipIds,
} from './layout'

function docWithClips() {
  const doc = createEmptyProjectDoc('P')
  const bus = new CommandBus(doc)
  const videoTrackId = doc.tracks[0].id
  const audioTrackId = doc.tracks[1].id
  const clipA = createClip({ trackId: videoTrackId, assetId: 'a1', startMicros: 0, durationMicros: 2_000_000 })
  const clipB = createClip({
    trackId: videoTrackId,
    assetId: 'a2',
    startMicros: 2_000_000,
    durationMicros: 3_000_000,
  })
  const clipC = createClip({
    trackId: audioTrackId,
    assetId: 'a3',
    startMicros: 0,
    durationMicros: 5_000_000,
  })
  bus.dispatch(addClip(clipA))
  bus.dispatch(addClip(clipB))
  bus.dispatch(addClip(clipC))
  return { doc: bus.getDoc(), clipA, clipB, clipC, videoTrackId, audioTrackId }
}

describe('timeToPx / pxToTime', () => {
  it('round-trips at a given zoom', () => {
    expect(timeToPx(2_000_000, 60)).toBe(120)
    expect(pxToTime(120, 60)).toBe(2_000_000)
  })
})

describe('clampZoom', () => {
  it('clamps to the min/max zoom bounds', () => {
    expect(clampZoom(0)).toBe(MIN_PX_PER_SECOND)
    expect(clampZoom(100_000)).toBe(MAX_PX_PER_SECOND)
    expect(clampZoom(80)).toBe(80)
  })
})

describe('computeTimelineLayout', () => {
  it('positions clips left-to-right by start time at the given zoom', () => {
    const { doc, videoTrackId } = docWithClips()
    const layout = computeTimelineLayout(doc, 60)
    const videoTrack = layout.tracks.find((t) => t.trackId === videoTrackId)!
    expect(videoTrack.clips).toHaveLength(2)
    expect(videoTrack.clips[0].x).toBe(0)
    expect(videoTrack.clips[0].width).toBe(120)
    expect(videoTrack.clips[1].x).toBe(120)
    expect(videoTrack.clips[1].width).toBe(180)
  })

  it('stacks tracks vertically in doc order', () => {
    const { doc } = docWithClips()
    const layout = computeTimelineLayout(doc, 60)
    expect(layout.tracks[0].y).toBe(0)
    expect(layout.tracks[1].y).toBeGreaterThan(layout.tracks[0].y)
  })

  it('computes overall content width from the furthest clip edge', () => {
    const { doc } = docWithClips()
    const layout = computeTimelineLayout(doc, 60)
    // video track's second clip ends at 5s -> 300px; audio clip also ends at 5s -> 300px
    expect(layout.contentWidthPx).toBe(300)
  })

  it('gives a very short clip a minimum tappable width', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    const trackId = doc.tracks[0].id
    bus.dispatch(addClip(createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 1000 })))
    const layout = computeTimelineLayout(bus.getDoc(), 60)
    expect(layout.tracks[0].clips[0].width).toBeGreaterThanOrEqual(6)
  })
})

describe('visibleClipIds', () => {
  it('excludes clips fully outside the viewport plus buffer', () => {
    const { doc, clipA, clipB } = docWithClips()
    const layout = computeTimelineLayout(doc, 60)
    // Viewport covers 0-10px, well before clipB (starts at x=120) even with a small buffer.
    const ids = visibleClipIds(layout, 0, 10, 5)
    expect(ids.has(clipA.id)).toBe(true)
    expect(ids.has(clipB.id)).toBe(false)
  })

  it('includes clips within the buffered range', () => {
    const { doc, clipB } = docWithClips()
    const layout = computeTimelineLayout(doc, 60)
    const ids = visibleClipIds(layout, 150, 200, 50)
    expect(ids.has(clipB.id)).toBe(true)
  })
})

describe('findClipRect / findTrackAtY', () => {
  it('finds a clip rect by id across tracks', () => {
    const { doc, clipC, audioTrackId } = docWithClips()
    const layout = computeTimelineLayout(doc, 60)
    const rect = findClipRect(layout, clipC.id)
    expect(rect?.trackId).toBe(audioTrackId)
  })

  it('finds the track under a given y coordinate', () => {
    const { doc, audioTrackId } = docWithClips()
    const layout = computeTimelineLayout(doc, 60)
    const audioTrack = layout.tracks.find((t) => t.trackId === audioTrackId)!
    const found = findTrackAtY(layout, audioTrack.y + 1)
    expect(found?.trackId).toBe(audioTrackId)
  })
})
