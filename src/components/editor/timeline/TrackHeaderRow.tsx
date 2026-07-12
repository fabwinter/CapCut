import { LockIcon, LockOpenIcon, VolumeOffIcon, Volume2Icon } from 'lucide-react'
import type { Track } from '#/editor/doc/schema'

export const TRACK_HEADER_WIDTH_PX = 128

interface TrackHeaderRowProps {
  track: Track
  height: number
  onToggleMute: () => void
  onToggleLock: () => void
}

export function TrackHeaderRow({ track, height, onToggleMute, onToggleLock }: TrackHeaderRowProps) {
  return (
    <div
      data-track-header
      data-track-id={track.id}
      className="border-border bg-card/60 flex items-center gap-1 border-b px-2"
      style={{ height, width: TRACK_HEADER_WIDTH_PX }}
    >
      <span className="text-foreground/80 min-w-0 flex-1 truncate text-[0.6875rem] font-medium">
        {track.name}
      </span>
      <button
        type="button"
        aria-label={track.muted ? 'Unmute track' : 'Mute track'}
        aria-pressed={track.muted}
        data-track-mute
        onClick={onToggleMute}
        className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded"
      >
        {track.muted ? <VolumeOffIcon className="size-3.5" /> : <Volume2Icon className="size-3.5" />}
      </button>
      <button
        type="button"
        aria-label={track.locked ? 'Unlock track' : 'Lock track'}
        aria-pressed={track.locked}
        data-track-lock
        onClick={onToggleLock}
        className="text-muted-foreground hover:text-foreground flex size-6 shrink-0 items-center justify-center rounded"
      >
        {track.locked ? <LockIcon className="size-3.5" /> : <LockOpenIcon className="size-3.5" />}
      </button>
    </div>
  )
}
