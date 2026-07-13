import { useCallback, useRef, useState } from 'react'
import { ChevronDownIcon } from 'lucide-react'
import type { ProjectDoc, Track, Clip } from '#/editor/doc/schema'
import { docToLanes } from '#/editor/doc/selectors/layout'
import { ClipView } from './ClipView'
import { TimelineRuler } from './TimelineRuler'
import { useEditorStore } from '#/editor/state/editorStore'
import { trimClipStart, trimClipEnd } from '#/editor/doc/commands/clips'

interface TimelineProps {
  doc: ProjectDoc
  selectedClipId?: string | null
  onSelectClip?: (clipId: string) => void
  currentTime?: number
}

export function Timeline({
  doc,
  selectedClipId: externalSelectedId,
  onSelectClip: onExternalSelectClip,
  currentTime = 0
}: TimelineProps) {
  const { dispatch } = useEditorStore()
  const [pxPerSecond, setPxPerSecond] = useState(100)
  const [selectedClipId, setSelectedClipId] = useState<string | null>(externalSelectedId ?? null)

  const handleSelectClip = useCallback((clipId: string) => {
    setSelectedClipId(clipId)
    onExternalSelectClip?.(clipId)
  }, [onExternalSelectClip])
  const [scrollLeft, setScrollLeft] = useState(0)
  const timelineContainerRef = useRef<HTMLDivElement>(null)
  const fps = doc.settings.fps

  const projectDurationMicros = Math.max(...doc.tracks.map(track => {
    let max = 0
    for (const clip of track.clips) {
      const end = clip.startMicros + clip.durationMicros
      if (end > max) max = end
    }
    return max
  }), 1_000_000) // Minimum 1 second

  const lanes = docToLanes(doc, pxPerSecond)

  const handleTrimClipStart = useCallback((
    clipId: string,
    deltaPixels: number
  ) => {
    // Find clip to get its current properties
    const clip = findClipById(doc, clipId)
    if (!clip) return

    const deltaMicros = Math.round((deltaPixels / pxPerSecond) * 1_000_000)
    const newInPoint = Math.max(0, clip.inPointMicros + deltaMicros)
    dispatch(trimClipStart(clipId, newInPoint, fps))
  }, [doc, dispatch, pxPerSecond, fps])

  const handleTrimClipEnd = useCallback((
    clipId: string,
    deltaPixels: number
  ) => {
    const clip = findClipById(doc, clipId)
    if (!clip) return

    const deltaMicros = Math.round((deltaPixels / pxPerSecond) * 1_000_000)
    const newOutPoint = clip.outPointMicros ?? clip.inPointMicros + clip.durationMicros
    const newValue = Math.max(clip.inPointMicros + 1, newOutPoint + deltaMicros)
    dispatch(trimClipEnd(clipId, newValue, fps))
  }, [doc, dispatch, pxPerSecond, fps])

  // Future: implement keyboard shortcuts for delete
  // const handleKeyDown = useCallback((e: KeyboardEvent) => {
  //   if (selectedClipId && e.key === 'Delete') {
  //     handleDeleteClip(selectedClipId)
  //   }
  // }, [selectedClipId, handleDeleteClip])

  // Future: keyboard shortcuts for delete
  // useEffect(() => {
  //   window.addEventListener('keydown', handleKeyDown)
  //   return () => window.removeEventListener('keydown', handleKeyDown)
  // }, [handleKeyDown])

  return (
    <div className="flex flex-col h-full bg-card/40">
      {/* Timeline ruler */}
      <TimelineRuler
        durationMicros={projectDurationMicros}
        pxPerSecond={pxPerSecond}
        scrollLeft={scrollLeft}
      />

      {/* Tracks container */}
      <div className="flex-1 overflow-hidden flex flex-col relative">
        <div
          ref={timelineContainerRef}
          className="flex-1 overflow-auto relative"
          onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
        >
          <div className="flex flex-col">
            {lanes.map((lane) => (
              <TrackLane
                key={lane.track.id}
                track={lane.track}
                pclips={lane.clips}
                selectedClipId={selectedClipId}
                onSelectClip={handleSelectClip}
                onTrimStart={handleTrimClipStart}
                onTrimEnd={handleTrimClipEnd}
              />
            ))}
          </div>

          {/* Playhead indicator */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none z-10"
            style={{
              left: `${(currentTime / 1_000_000) * pxPerSecond}px`,
            }}
          />
        </div>
      </div>

      {/* Zoom & transport controls */}
      <div className="border-t border-border/50 px-3 py-2 flex items-center gap-2">
        <button
          onClick={() => setPxPerSecond(Math.max(25, pxPerSecond - 25))}
          className="text-xs px-2 py-1 rounded hover:bg-muted"
        >
          −
        </button>
        <span className="text-xs text-muted-foreground w-12">
          {pxPerSecond}px/s
        </span>
        <button
          onClick={() => setPxPerSecond(Math.min(400, pxPerSecond + 25))}
          className="text-xs px-2 py-1 rounded hover:bg-muted"
        >
          +
        </button>
      </div>
    </div>
  )
}

interface TrackLaneProps {
  track: Track
  pclips: any[]
  selectedClipId: string | null
  onSelectClip: (clipId: string) => void
  // onDeleteClip: (clipId: string) => void  // Reserved for future use
  // onMoveClip: (clipId: string, trackId: string, newStartMicros: Micros) => void  // Reserved for future use
  onTrimStart: (clipId: string, deltaPixels: number) => void
  onTrimEnd: (clipId: string, deltaPixels: number) => void
  // pxPerSecond: number  // Reserved for future use
}

function TrackLane({
  track,
  pclips,
  selectedClipId,
  onSelectClip,
  // onDeleteClip,
  // onMoveClip,
  onTrimStart,
  onTrimEnd,
  // pxPerSecond,
}: TrackLaneProps) {
  // Future: implement drag-to-move clips
  // const [isDragging, setIsDragging] = useState(false)
  // const [dragClipId, setDragClipId] = useState<string | null>(null)
  // const dragStartXRef = useRef(0)

  // const handleClipMouseDown = (
  //   e: React.MouseEvent,
  //   clipId: string,
  //   pxPerSecond: number
  // ) => {
  //   if ((e.target as HTMLElement).classList.contains('cursor-ew-resize')) {
  //     return // This is a trim handle
  //   }
  //   setIsDragging(true)
  //   setDragClipId(clipId)
  //   dragStartXRef.current = e.clientX
  // }

  return (
    <div className="border-b border-border/30 flex bg-muted/20">
      {/* Track header */}
      <div className="w-48 shrink-0 border-r border-border/30 px-3 py-2 flex items-center gap-2">
        <button className="text-muted-foreground hover:text-foreground">
          <ChevronDownIcon className="size-4" />
        </button>
        <span className="text-xs font-medium truncate">{track.name}</span>
      </div>

      {/* Clips area */}
      <div className="flex-1 relative overflow-hidden h-16 bg-card/20">
        <div className="relative h-full">
          {pclips.map((pclip: any) => (
            <ClipView
              key={pclip.clip.id}
              pclip={pclip}
              isSelected={pclip.clip.id === selectedClipId}
              onClick={() => onSelectClip(pclip.clip.id)}
              onTrimStart={(delta) => onTrimStart(pclip.clip.id, delta)}
              onTrimEnd={(delta) => onTrimEnd(pclip.clip.id, delta)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function findClipById(doc: ProjectDoc, clipId: string): Clip | null {
  for (const track of doc.tracks) {
    const clip = track.clips.find((c) => c.id === clipId)
    if (clip) return clip
  }
  return null
}
