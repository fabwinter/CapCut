import { createId, type Track, type TrackKind } from '../schema'
import type { Command } from './types'

function defaultTrackName(kind: TrackKind, existing: Track[]): string {
  const count = existing.filter((t) => t.kind === kind).length + 1
  const label = kind.charAt(0).toUpperCase() + kind.slice(1)
  return `${label} ${count}`
}

export function addTrack(kind: TrackKind, name?: string): Command {
  return {
    name: 'AddTrack',
    recipe: (draft) => {
      const track: Track = {
        id: createId(),
        kind,
        name: name ?? defaultTrackName(kind, draft.tracks),
        muted: false,
        locked: false,
        clips: [],
      }
      draft.tracks.push(track)
      draft.modifiedAt = Date.now()
    },
  }
}

export function removeTrack(trackId: string): Command {
  return {
    name: 'RemoveTrack',
    recipe: (draft) => {
      const before = draft.tracks.length
      draft.tracks = draft.tracks.filter((t) => t.id !== trackId)
      if (draft.tracks.length !== before) draft.modifiedAt = Date.now()
    },
  }
}

/** Reorders a track to a new index in the track stack (drag on a track header). */
export function reorderTracks(trackId: string, toIndex: number): Command {
  return {
    name: 'ReorderTracks',
    recipe: (draft) => {
      const fromIndex = draft.tracks.findIndex((t) => t.id === trackId)
      if (fromIndex === -1) return
      const clamped = Math.max(0, Math.min(toIndex, draft.tracks.length - 1))
      if (clamped === fromIndex) return
      const [track] = draft.tracks.splice(fromIndex, 1)
      draft.tracks.splice(clamped, 0, track)
      draft.modifiedAt = Date.now()
    },
  }
}

export function setTrackMuted(trackId: string, muted: boolean): Command {
  return {
    name: 'SetTrackMuted',
    recipe: (draft) => {
      const track = draft.tracks.find((t) => t.id === trackId)
      if (!track || track.muted === muted) return
      track.muted = muted
      draft.modifiedAt = Date.now()
    },
  }
}

export function setTrackLocked(trackId: string, locked: boolean): Command {
  return {
    name: 'SetTrackLocked',
    recipe: (draft) => {
      const track = draft.tracks.find((t) => t.id === trackId)
      if (!track || track.locked === locked) return
      track.locked = locked
      draft.modifiedAt = Date.now()
    },
  }
}
