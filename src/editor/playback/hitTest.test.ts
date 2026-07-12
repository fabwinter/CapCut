import { describe, expect, it } from 'vitest'
import { CommandBus } from '#/editor/doc/commands/bus'
import { addAsset } from '#/editor/doc/commands/assets'
import { addClip, createClip } from '#/editor/doc/commands/clips'
import { setClipTransform } from '#/editor/doc/commands/transform'
import { addTrack } from '#/editor/doc/commands/tracks'
import { createEmptyProjectDoc, type AssetRef } from '#/editor/doc/schema'
import { hitTestClip } from './hitTest'

function videoAsset(id: string, width: number, height: number): AssetRef {
  return {
    id,
    kind: 'video',
    opfsPath: `assets/${id}/original`,
    originalName: 'clip.mp4',
    status: 'ready',
    width,
    height,
    createdAt: Date.now(),
  }
}

describe('hitTestClip', () => {
  it('hits a clip covering the full canvas', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    bus.dispatch(addAsset(videoAsset('a1', 1080, 1920)))
    const trackId = doc.tracks[0].id
    bus.dispatch(addClip(createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 1_000_000 })))

    const hit = hitTestClip(bus.getDoc(), 500_000, { x: 540, y: 960 }, 1080, 1920)
    expect(hit?.assetId).toBe('a1')
  })

  it('misses when there is no active clip at that time', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    bus.dispatch(addAsset(videoAsset('a1', 1080, 1920)))
    const trackId = doc.tracks[0].id
    bus.dispatch(addClip(createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 1_000_000 })))

    expect(hitTestClip(bus.getDoc(), 2_000_000, { x: 540, y: 960 }, 1080, 1920)).toBeUndefined()
  })

  it('misses a point outside a scaled-down clip quad', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    bus.dispatch(addAsset(videoAsset('a1', 1080, 1920)))
    const trackId = doc.tracks[0].id
    const clip = createClip({ trackId, assetId: 'a1', startMicros: 0, durationMicros: 1_000_000 })
    bus.dispatch(addClip(clip))
    bus.dispatch(setClipTransform(clip.id, { scale: 0.1 }))

    expect(hitTestClip(bus.getDoc(), 500_000, { x: 10, y: 10 }, 1080, 1920)).toBeUndefined()
    expect(hitTestClip(bus.getDoc(), 500_000, { x: 540, y: 960 }, 1080, 1920)?.id).toBe(clip.id)
  })

  it('returns the topmost clip when tracks overlap', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    bus.dispatch(addTrack('overlay'))
    bus.dispatch(addAsset(videoAsset('bottom', 1080, 1920)))
    bus.dispatch(addAsset(videoAsset('top', 1080, 1920)))
    const videoTrackId = bus.getDoc().tracks[0].id
    const overlayTrackId = bus.getDoc().tracks.at(-1)!.id
    bus.dispatch(addClip(createClip({ trackId: videoTrackId, assetId: 'bottom', startMicros: 0, durationMicros: 1_000_000 })))
    bus.dispatch(addClip(createClip({ trackId: overlayTrackId, assetId: 'top', startMicros: 0, durationMicros: 1_000_000 })))

    const hit = hitTestClip(bus.getDoc(), 500_000, { x: 540, y: 960 }, 1080, 1920)
    expect(hit?.assetId).toBe('top')
  })

  it('never hits an audio track clip', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    const audioTrackId = doc.tracks[1].id
    bus.dispatch(addClip(createClip({ trackId: audioTrackId, assetId: 'a1', startMicros: 0, durationMicros: 1_000_000 })))

    expect(hitTestClip(bus.getDoc(), 500_000, { x: 540, y: 960 }, 1080, 1920)).toBeUndefined()
  })
})
