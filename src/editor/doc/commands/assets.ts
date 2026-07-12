import type { AssetRef, AssetStatus } from '../schema'
import type { Command } from './types'

export function addAsset(asset: AssetRef): Command {
  return {
    name: 'AddAsset',
    recipe: (draft) => {
      draft.assets.push(asset)
      draft.modifiedAt = Date.now()
    },
  }
}

export function updateAsset(assetId: string, patch: Partial<Omit<AssetRef, 'id'>>): Command {
  return {
    name: 'UpdateAsset',
    recipe: (draft) => {
      const asset = draft.assets.find((a) => a.id === assetId)
      if (!asset) return
      Object.assign(asset, patch)
      draft.modifiedAt = Date.now()
    },
  }
}

export function setAssetStatus(assetId: string, status: AssetStatus, errorMessage?: string): Command {
  return {
    name: 'SetAssetStatus',
    recipe: (draft) => {
      const asset = draft.assets.find((a) => a.id === assetId)
      if (!asset) return
      asset.status = status
      asset.errorMessage = errorMessage
      draft.modifiedAt = Date.now()
    },
  }
}

/** Removes an asset and any clips on the timeline that reference it. */
export function removeAsset(assetId: string): Command {
  return {
    name: 'RemoveAsset',
    recipe: (draft) => {
      draft.assets = draft.assets.filter((a) => a.id !== assetId)
      for (const track of draft.tracks) {
        track.clips = track.clips.filter((clip) => clip.assetId !== assetId)
      }
      draft.modifiedAt = Date.now()
    },
  }
}
