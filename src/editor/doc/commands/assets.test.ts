import { describe, expect, it } from 'vitest'
import { createEmptyProjectDoc, type AssetRef } from '../schema'
import { CommandBus } from './bus'
import { addAsset, removeAsset, setAssetStatus, updateAsset } from './assets'

function makeAsset(id: string): AssetRef {
  return {
    id,
    kind: 'video',
    opfsPath: `assets/${id}/original`,
    originalName: 'clip.mp4',
    status: 'importing',
    createdAt: Date.now(),
  }
}

describe('asset commands', () => {
  it('adds an asset to the doc', () => {
    const bus = new CommandBus(createEmptyProjectDoc('P'))
    bus.dispatch(addAsset(makeAsset('a1')))
    expect(bus.getDoc().assets).toHaveLength(1)
    expect(bus.getDoc().assets[0].id).toBe('a1')
  })

  it('updates fields on an existing asset', () => {
    const bus = new CommandBus(createEmptyProjectDoc('P'))
    bus.dispatch(addAsset(makeAsset('a1')))
    bus.dispatch(updateAsset('a1', { width: 1920, height: 1080, fps: 30, durationMicros: 5_000_000 }))
    const asset = bus.getDoc().assets[0]
    expect(asset.width).toBe(1920)
    expect(asset.durationMicros).toBe(5_000_000)
  })

  it('transitions asset status and clears/sets error message', () => {
    const bus = new CommandBus(createEmptyProjectDoc('P'))
    bus.dispatch(addAsset(makeAsset('a1')))
    bus.dispatch(setAssetStatus('a1', 'error', 'decode failed'))
    expect(bus.getDoc().assets[0].status).toBe('error')
    expect(bus.getDoc().assets[0].errorMessage).toBe('decode failed')

    bus.dispatch(setAssetStatus('a1', 'ready'))
    expect(bus.getDoc().assets[0].status).toBe('ready')
    expect(bus.getDoc().assets[0].errorMessage).toBeUndefined()
  })

  it('removes an asset and any clips referencing it', () => {
    const doc = createEmptyProjectDoc('P')
    const bus = new CommandBus(doc)
    bus.dispatch(addAsset(makeAsset('a1')))

    bus.dispatch({
      name: 'TestAddClip',
      recipe: (draft) => {
        draft.tracks[0].clips.push({
          id: 'c1',
          trackId: draft.tracks[0].id,
          assetId: 'a1',
          startMicros: 0,
          durationMicros: 1_000_000,
          inPointMicros: 0,
          speed: 1,
          volume: 1,
          muted: false,
          fadeInMicros: 0,
          fadeOutMicros: 0,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
          effects: [],
          keyframes: [],
        })
      },
    })

    bus.dispatch(removeAsset('a1'))
    expect(bus.getDoc().assets).toHaveLength(0)
    expect(bus.getDoc().tracks[0].clips).toHaveLength(0)
  })

  it('is a no-op when the asset does not exist', () => {
    const bus = new CommandBus(createEmptyProjectDoc('P'))
    bus.dispatch(updateAsset('missing', { width: 100 }))
    expect(bus.canUndo()).toBe(false)
  })
})
