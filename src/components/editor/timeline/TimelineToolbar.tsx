import {
  CopyIcon,
  FilmIcon,
  LayersIcon,
  Music2Icon,
  ScissorsIcon,
  TrashIcon,
  TypeIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from 'lucide-react'
import { Button } from '#/components/ui/button'
import type { Clip, TrackKind } from '#/editor/doc/schema'
import type { Micros } from '#/editor/doc/time'

interface TimelineToolbarProps {
  selectedClip?: Clip
  playheadMicros: Micros
  onSplit: () => void
  onDuplicate: () => void
  onDelete: (ripple: boolean) => void
  onAddTrack: (kind: TrackKind) => void
  onZoomIn: () => void
  onZoomOut: () => void
}

const TRACK_KINDS: { kind: TrackKind; icon: typeof FilmIcon; label: string }[] = [
  { kind: 'video', icon: FilmIcon, label: 'Add video track' },
  { kind: 'overlay', icon: LayersIcon, label: 'Add overlay track' },
  { kind: 'text', icon: TypeIcon, label: 'Add text track' },
  { kind: 'audio', icon: Music2Icon, label: 'Add audio track' },
]

export function TimelineToolbar({
  selectedClip,
  playheadMicros,
  onSplit,
  onDuplicate,
  onDelete,
  onAddTrack,
  onZoomIn,
  onZoomOut,
}: TimelineToolbarProps) {
  const canSplit =
    !!selectedClip &&
    playheadMicros > selectedClip.startMicros &&
    playheadMicros < selectedClip.startMicros + selectedClip.durationMicros

  return (
    <div className="border-border bg-card/60 flex h-9 shrink-0 items-center gap-1 border-b px-2">
      {selectedClip ? (
        <>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Split clip at playhead"
            data-action="split"
            disabled={!canSplit}
            onClick={onSplit}
          >
            <ScissorsIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Duplicate clip"
            data-action="duplicate"
            onClick={onDuplicate}
          >
            <CopyIcon className="size-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Delete clip"
            data-action="delete"
            onClick={() => onDelete(false)}
          >
            <TrashIcon className="size-3.5" />
          </Button>
        </>
      ) : (
        <div className="flex items-center gap-1">
          {TRACK_KINDS.map(({ kind, icon: Icon, label }) => (
            <Button
              key={kind}
              variant="ghost"
              size="icon-sm"
              aria-label={label}
              data-action={`add-track-${kind}`}
              onClick={() => onAddTrack(kind)}
            >
              <Icon className="size-3.5" />
            </Button>
          ))}
        </div>
      )}

      <div className="ml-auto flex items-center gap-1">
        <Button variant="ghost" size="icon-sm" aria-label="Zoom out" data-action="zoom-out" onClick={onZoomOut}>
          <ZoomOutIcon className="size-3.5" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Zoom in" data-action="zoom-in" onClick={onZoomIn}>
          <ZoomInIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  )
}
