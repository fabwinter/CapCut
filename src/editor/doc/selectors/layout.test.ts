import { describe, it, expect, beforeEach } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import type { ProjectDoc } from '../schema'
import {
  docToLanes,
  findClipAtPixel,
  findTrimHandle,
  pixelsToMicros,
  microsToPixels,
  findClipsInTimeRange,
  timeToPlayheadPosition,
} from './layout'
import { CommandBus } from '../commands/bus'
import { addClipFromAsset } from '../commands/clips'

describe('layout selector', () => {
  let doc: ProjectDoc
  let bus: CommandBus
  const fps = 30
  const pxPerSecond = 100

  beforeEach(() => {
    doc = createEmptyProjectDoc('Test')
    bus = new CommandBus(doc)
    // Add a test clip: 2 seconds long starting at 0
    bus.dispatch(addClipFromAsset(doc.tracks[0].id, 'asset-1', 2_000_000, fps))
  })

  it('converts doc to positioned lanes', () => {
    const lanes = docToLanes(bus.getDoc(), pxPerSecond)
    expect(lanes.length).toBeGreaterThan(0)
    expect(lanes[0].clips.length).toBe(1)
  })

  it('calculates clip position correctly', () => {
    const lanes = docToLanes(bus.getDoc(), pxPerSecond)
    const pclip = lanes[0].clips[0]
    expect(pclip.startPx).toBe(0) // starts at 0 seconds
    expect(pclip.widthPx).toBe(200) // 2 seconds * 100 px/s
  })

  it('finds clip at pixel position', () => {
    const lanes = docToLanes(bus.getDoc(), pxPerSecond)
    const track = lanes[0]

    const clipAtStart = findClipAtPixel(track, 50)
    expect(clipAtStart).toBeDefined()
    expect(clipAtStart?.clip.assetId).toBe('asset-1')

    const clipAtEnd = findClipAtPixel(track, 190)
    expect(clipAtEnd).toBeDefined()

    const noClip = findClipAtPixel(track, 250)
    expect(noClip).toBeNull()
  })

  it('detects trim handles', () => {
    const lanes = docToLanes(bus.getDoc(), pxPerSecond)
    const pclip = lanes[0].clips[0]

    // Left edge trim handle
    const leftTrim = findTrimHandle(pclip, 5, 12)
    expect(leftTrim).toBe('in')

    // Right edge trim handle
    const rightTrim = findTrimHandle(pclip, 195, 12)
    expect(rightTrim).toBe('out')

    // Middle: not a trim handle
    const middle = findTrimHandle(pclip, 100, 12)
    expect(middle).toBeNull()
  })

  it('converts pixels to microseconds', () => {
    const micros = pixelsToMicros(100, pxPerSecond, fps)
    // 100px / 100px/s = 1 second = 1_000_000 micros
    expect(micros).toBe(1_000_000)
  })

  it('converts microseconds to pixels', () => {
    const pixels = microsToPixels(1_000_000, pxPerSecond)
    // 1 second * 100 px/s = 100px
    expect(pixels).toBe(100)
  })

  it('finds clips in time range', () => {
    // Add second clip at 1 second (will be positioned at 2 seconds after first clip ends)
    bus.dispatch(addClipFromAsset(doc.tracks[0].id, 'asset-2', 1_000_000, fps))

    // First clip: 0-2s, Second clip: 2-3s
    // Range 500k-2.5M (0.5s-2.5s) overlaps both
    const inRange = findClipsInTimeRange(bus.getDoc().tracks[0], 500_000, 2_500_000)
    expect(inRange.length).toBe(2) // Both clips overlap this range
  })

  it('calculates playhead position', () => {
    const pos = timeToPlayheadPosition(1_000_000, pxPerSecond)
    expect(pos).toBe(100) // 1 second at 100 px/s = 100px
  })

  it('handles multiple clips at same track', () => {
    bus.dispatch(addClipFromAsset(doc.tracks[0].id, 'asset-2', 1_000_000, fps))
    const lanes = docToLanes(bus.getDoc(), pxPerSecond)
    const track = lanes[0]

    expect(track.clips.length).toBe(2)
    expect(track.clips[0].startPx).toBe(0)
    expect(track.clips[1].startPx).toBe(200) // After first 2-second clip
  })
})
