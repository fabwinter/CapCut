import { useEffect, useMemo, useRef, useState } from 'react'
import { deleteClip, duplicateClip, moveClip, splitClip, trimClipEnd, trimClipStart } from '#/editor/doc/commands/clips'
import { addTrack, setTrackLocked, setTrackMuted } from '#/editor/doc/commands/tracks'
import { projectDurationMicros, type ProjectDoc, type TrackKind } from '#/editor/doc/schema'
import {
  clampZoom,
  computeTimelineLayout,
  DEFAULT_PX_PER_SECOND,
  findTrackAtY,
  timeToPx,
  visibleClipIds,
} from '#/editor/doc/selectors/layout'
import { frameDurationMicros, type Micros } from '#/editor/doc/time'
import { useEditorStore } from '#/editor/state/editorStore'
import { usePanZoom } from './panZoom'
import { RULER_HEIGHT_PX, TimelineRuler } from './TimelineRuler'
import { TimelineClip } from './TimelineClip'
import { TimelineToolbar } from './TimelineToolbar'
import { TRACK_HEADER_WIDTH_PX, TrackHeaderRow } from './TrackHeaderRow'

const ZOOM_STEP_FACTOR = 1.4

interface TimelineProps {
  projectId: string
  doc: ProjectDoc
}

export function Timeline({ projectId, doc }: TimelineProps) {
  const dispatch = useEditorStore((s) => s.dispatch)
  const selectedClipId = useEditorStore((s) => s.selectedClipId)
  const playheadMicros = useEditorStore((s) => s.playheadMicros)
  const selectClip = useEditorStore((s) => s.selectClip)
  const setPlayhead = useEditorStore((s) => s.setPlayhead)

  const [pxPerSecond, setPxPerSecond] = useState(DEFAULT_PX_PER_SECOND)
  const scrollRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [viewportWidth, setViewportWidth] = useState(0)

  const layout = useMemo(() => computeTimelineLayout(doc, pxPerSecond), [doc, pxPerSecond])
  const panZoom = usePanZoom({ containerRef: scrollRef, pxPerSecond, setPxPerSecond })

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => setViewportWidth(el.clientWidth))
    observer.observe(el)
    setViewportWidth(el.clientWidth)
    return () => observer.disconnect()
  }, [])

  const viewportStartPx = scrollLeft - TRACK_HEADER_WIDTH_PX
  const viewportEndPx = viewportStartPx + viewportWidth
  const visibleIds = useMemo(
    () => visibleClipIds(layout, viewportStartPx, viewportEndPx),
    [layout, viewportStartPx, viewportEndPx],
  )

  const selectedClip = useMemo(() => {
    if (!selectedClipId) return undefined
    for (const track of doc.tracks) {
      const clip = track.clips.find((c) => c.id === selectedClipId)
      if (clip) return clip
    }
    return undefined
  }, [doc, selectedClipId])

  function toContentPoint(clientX: number, clientY: number) {
    const rect = contentRef.current?.getBoundingClientRect()
    if (!rect) return { x: 0, y: 0 }
    return { x: clientX - rect.left, y: clientY - rect.top }
  }

  function trackIdAt(contentY: number): string | undefined {
    return findTrackAtY(layout, contentY)?.trackId
  }

  function trackYFor(trackId: string): number | undefined {
    return layout.tracks.find((t) => t.trackId === trackId)?.y
  }

  function getSnapTargets(trackId: string, excludeClipId: string): Micros[] {
    const track = doc.tracks.find((t) => t.id === trackId)
    if (!track) return []
    const targets: Micros[] = []
    for (const clip of track.clips) {
      if (clip.id === excludeClipId) continue
      targets.push(clip.startMicros, clip.startMicros + clip.durationMicros)
    }
    return targets
  }

  function zoomBy(factor: number) {
    setPxPerSecond((prev) => clampZoom(prev * factor))
  }

  function zoomToFit() {
    const durationMicros = projectDurationMicros(doc)
    if (durationMicros <= 0 || viewportWidth <= 0) return
    const availableWidth = Math.max(1, viewportWidth - TRACK_HEADER_WIDTH_PX)
    setPxPerSecond(clampZoom(availableWidth / (durationMicros / 1_000_000)))
  }

  function stepFrame(direction: 1 | -1) {
    const step = frameDurationMicros(doc.settings.fps)
    setPlayhead(Math.max(0, playheadMicros + direction * step))
  }

  function jumpToStart() {
    setPlayhead(0)
  }

  function jumpToEnd() {
    setPlayhead(projectDurationMicros(doc))
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <TimelineToolbar
        selectedClip={selectedClip}
        playheadMicros={playheadMicros}
        onSplit={() => selectedClipId && dispatch(splitClip(selectedClipId, playheadMicros))}
        onDuplicate={() => selectedClipId && dispatch(duplicateClip(selectedClipId))}
        onDelete={(ripple) => {
          if (!selectedClipId) return
          dispatch(deleteClip(selectedClipId, { ripple }))
          selectClip(null)
        }}
        onAddTrack={(kind: TrackKind) => dispatch(addTrack(kind))}
        onZoomIn={() => zoomBy(ZOOM_STEP_FACTOR)}
        onZoomOut={() => zoomBy(1 / ZOOM_STEP_FACTOR)}
        onZoomToFit={zoomToFit}
        onJumpToStart={jumpToStart}
        onJumpToEnd={jumpToEnd}
        onStepFrameBack={() => stepFrame(-1)}
        onStepFrameForward={() => stepFrame(1)}
      />

      <div
        ref={scrollRef}
        data-timeline-scroll
        className="relative flex-1 overflow-auto"
        style={{ touchAction: 'none' }}
        onScroll={(e) => setScrollLeft(e.currentTarget.scrollLeft)}
        onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest('[data-clip]')) return
          panZoom.onPointerDown(e)
        }}
        onPointerMove={panZoom.onPointerMove}
        onPointerUp={panZoom.onPointerUp}
        onPointerCancel={panZoom.onPointerCancel}
      >
        <div
          className="relative"
          style={{
            width: TRACK_HEADER_WIDTH_PX + layout.contentWidthPx,
            height: RULER_HEIGHT_PX + layout.contentHeightPx,
          }}
        >
          <div
            data-playhead
            className="pointer-events-none absolute top-0 bottom-0 z-30 w-px bg-red-500"
            style={{ left: TRACK_HEADER_WIDTH_PX + timeToPx(playheadMicros, pxPerSecond) }}
          />

          <div className="sticky top-0 z-20 flex" style={{ height: RULER_HEIGHT_PX }}>
            <div
              className="bg-card border-border sticky left-0 z-10 shrink-0 border-r border-b"
              style={{ width: TRACK_HEADER_WIDTH_PX, height: RULER_HEIGHT_PX }}
            />
            <TimelineRuler pxPerSecond={pxPerSecond} widthPx={layout.contentWidthPx} onScrub={setPlayhead} />
          </div>

          <div className="flex">
            <div className="bg-card border-border sticky left-0 z-10 shrink-0 border-r" style={{ width: TRACK_HEADER_WIDTH_PX }}>
              {doc.tracks.map((track, i) => (
                <TrackHeaderRow
                  key={track.id}
                  track={track}
                  height={layout.tracks[i].height}
                  onToggleMute={() => dispatch(setTrackMuted(track.id, !track.muted))}
                  onToggleLock={() => dispatch(setTrackLocked(track.id, !track.locked))}
                />
              ))}
            </div>

            <div
              ref={contentRef}
              data-timeline-content
              className="relative"
              style={{ width: layout.contentWidthPx, height: layout.contentHeightPx }}
              onPointerDown={(e) => {
                if ((e.target as HTMLElement).closest('[data-clip]')) return
                selectClip(null)
              }}
            >
              {layout.tracks.map((track) => (
                <div
                  key={track.trackId}
                  data-track-lane
                  data-track-id={track.trackId}
                  className="border-border/60 absolute inset-x-0 border-b"
                  style={{ top: track.y, height: track.height }}
                />
              ))}

              {doc.tracks.map((track, trackIndex) =>
                track.clips
                  .filter((clip) => visibleIds.has(clip.id))
                  .map((clip) => {
                    const rect = layout.tracks[trackIndex].clips.find((c) => c.clipId === clip.id)
                    if (!rect) return null
                    const asset = clip.assetId ? doc.assets.find((a) => a.id === clip.assetId) : undefined
                    return (
                      <TimelineClip
                        key={clip.id}
                        clip={clip}
                        asset={asset}
                        x={rect.x}
                        y={layout.tracks[trackIndex].y}
                        width={rect.width}
                        height={layout.tracks[trackIndex].height}
                        projectId={projectId}
                        pxPerSecond={pxPerSecond}
                        fps={doc.settings.fps}
                        selected={clip.id === selectedClipId}
                        locked={track.locked}
                        playheadMicros={playheadMicros}
                        toContentPoint={toContentPoint}
                        trackIdAt={trackIdAt}
                        trackYFor={trackYFor}
                        getSnapTargets={getSnapTargets}
                        onSelect={selectClip}
                        onMoveCommit={(clipId, trackId, startMicros) =>
                          dispatch(moveClip(clipId, { trackId, startMicros }))
                        }
                        onTrimStartCommit={(clipId, startMicros) => dispatch(trimClipStart(clipId, startMicros))}
                        onTrimEndCommit={(clipId, endMicros) => dispatch(trimClipEnd(clipId, endMicros))}
                      />
                    )
                  }),
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
