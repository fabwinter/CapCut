import { useRef, useState } from 'react'
import type { AssetRef, Clip } from '#/editor/doc/schema'
import { pxToTime } from '#/editor/doc/selectors/layout'
import type { Micros } from '#/editor/doc/time'
import { snapMicros, thresholdMicrosForPx } from '#/editor/gestures/snap'
import { useClipThumbnails, useClipWaveformPeaks } from './useClipMedia'

const SNAP_THRESHOLD_PX = 8
const HANDLE_WIDTH_PX = 10

type DragKind = 'move' | 'trim-start' | 'trim-end'

interface DragState {
  kind: DragKind
  pointerId: number
  grabOffsetX: number
  originStartMicros: Micros
  originDurationMicros: Micros
  originTrackId: string
  previewStartMicros: Micros
  previewTrackId: string
}

export interface TimelineClipProps {
  clip: Clip
  asset?: AssetRef
  x: number
  y: number
  width: number
  height: number
  projectId: string
  pxPerSecond: number
  fps: number
  selected: boolean
  locked: boolean
  playheadMicros: Micros
  toContentPoint: (clientX: number, clientY: number) => { x: number; y: number }
  trackIdAt: (contentY: number) => string | undefined
  trackYFor: (trackId: string) => number | undefined
  getSnapTargets: (trackId: string, excludeClipId: string) => Micros[]
  onSelect: (clipId: string) => void
  onMoveCommit: (clipId: string, trackId: string, startMicros: Micros) => void
  onTrimStartCommit: (clipId: string, startMicros: Micros) => void
  onTrimEndCommit: (clipId: string, endMicros: Micros) => void
  onKeyframeClick?: (micros: Micros) => void
}

export function TimelineClip(props: TimelineClipProps) {
  const {
    clip,
    asset,
    x,
    y,
    width,
    height,
    projectId,
    pxPerSecond,
    fps,
    selected,
    locked,
    playheadMicros,
    toContentPoint,
    trackIdAt,
    trackYFor,
    getSnapTargets,
    onSelect,
    onMoveCommit,
    onTrimStartCommit,
    onTrimEndCommit,
    onKeyframeClick,
  } = props

  const [drag, setDrag] = useState<DragState | null>(null)
  const movedRef = useRef(false)
  const thumbnails = useClipThumbnails(projectId, asset, clip)
  const waveform = useClipWaveformPeaks(projectId, asset, clip)

  const thresholdMicros = thresholdMicrosForPx(SNAP_THRESHOLD_PX, pxPerSecond)

  function beginDrag(kind: DragKind, e: React.PointerEvent) {
    if (locked) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    movedRef.current = false
    const point = toContentPoint(e.clientX, e.clientY)
    setDrag({
      kind,
      pointerId: e.pointerId,
      grabOffsetX: point.x - x,
      originStartMicros: clip.startMicros,
      originDurationMicros: clip.durationMicros,
      originTrackId: clip.trackId,
      previewStartMicros: clip.startMicros,
      previewTrackId: clip.trackId,
    })
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return
    movedRef.current = true
    const point = toContentPoint(e.clientX, e.clientY)

    if (drag.kind === 'move') {
      const targetTrackId = trackIdAt(point.y) ?? drag.previewTrackId
      const candidateStartMicros = pxToTime(point.x - drag.grabOffsetX, pxPerSecond)
      const snapTargets = [playheadMicros, ...getSnapTargets(targetTrackId, clip.id)]
      const snapped = Math.max(0, snapMicros(candidateStartMicros, snapTargets, fps, thresholdMicros))
      setDrag({ ...drag, previewStartMicros: snapped, previewTrackId: targetTrackId })
      return
    }

    if (drag.kind === 'trim-start') {
      const endMicros = drag.originStartMicros + drag.originDurationMicros
      const candidate = pxToTime(point.x, pxPerSecond)
      const snapTargets = [playheadMicros, ...getSnapTargets(drag.originTrackId, clip.id)]
      const snapped = Math.min(endMicros, Math.max(0, snapMicros(candidate, snapTargets, fps, thresholdMicros)))
      setDrag({ ...drag, previewStartMicros: snapped })
      return
    }

    // trim-end: reuse previewStartMicros as the previewed *end* time to avoid a third field.
    const candidate = pxToTime(point.x, pxPerSecond)
    const snapTargets = [playheadMicros, ...getSnapTargets(drag.originTrackId, clip.id)]
    const snapped = Math.max(
      drag.originStartMicros,
      snapMicros(candidate, snapTargets, fps, thresholdMicros),
    )
    setDrag({ ...drag, previewStartMicros: snapped })
  }

  function endDrag(e: React.PointerEvent) {
    if (!drag || e.pointerId !== drag.pointerId) return
    if (!movedRef.current) {
      onSelect(clip.id)
    } else if (drag.kind === 'move') {
      onMoveCommit(clip.id, drag.previewTrackId, drag.previewStartMicros)
    } else if (drag.kind === 'trim-start') {
      onTrimStartCommit(clip.id, drag.previewStartMicros)
    } else {
      onTrimEndCommit(clip.id, drag.previewStartMicros)
    }
    setDrag(null)
  }

  const previewTrackY = drag ? (trackYFor(drag.previewTrackId) ?? y) : y
  const renderX = drag?.kind === 'move' ? (() => {
    // convert previewStartMicros back to px for rendering
    return (drag.previewStartMicros / 1_000_000) * pxPerSecond
  })() : x
  const renderY = drag?.kind === 'move' ? previewTrackY : y
  let renderWidth = width
  let renderStartX = renderX
  if (drag?.kind === 'trim-start') {
    const endMicros = drag.originStartMicros + drag.originDurationMicros
    renderStartX = (drag.previewStartMicros / 1_000_000) * pxPerSecond
    renderWidth = Math.max(6, ((endMicros - drag.previewStartMicros) / 1_000_000) * pxPerSecond)
  } else if (drag?.kind === 'trim-end') {
    renderWidth = Math.max(6, ((drag.previewStartMicros - drag.originStartMicros) / 1_000_000) * pxPerSecond)
  }

  const kindColor =
    clip.text !== undefined
      ? 'bg-violet-500/25 ring-violet-400/60'
      : asset?.kind === 'audio'
        ? 'bg-emerald-500/25 ring-emerald-400/60'
        : 'bg-sky-500/25 ring-sky-400/60'

  return (
    <div
      data-clip
      data-clip-id={clip.id}
      data-selected={selected}
      data-dragging={!!drag}
      className={`ring-inset absolute flex select-none flex-col overflow-hidden rounded-md ring-1 ${kindColor} ${
        selected ? 'ring-2 ring-white' : ''
      } ${locked ? 'opacity-60' : ''}`}
      style={{ left: renderStartX, top: renderY, width: renderWidth, height, touchAction: 'none', zIndex: drag ? 20 : 1 }}
      onPointerDown={(e) => beginDrag('move', e)}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {thumbnails.length > 0 && (
        <div className="absolute inset-0 flex">
          {thumbnails.map((url, i) => (
            <img key={i} src={url} alt="" className="h-full min-w-0 flex-1 object-cover opacity-70" />
          ))}
        </div>
      )}
      {waveform && waveform.length > 0 && <WaveformBars peaks={waveform} />}
      {clip.keyframes.length > 0 && (
        <div className="absolute inset-0 pointer-events-none">
          {clip.keyframes.map((k) => {
            const keyframeX = (k.atMicros / (clip.durationMicros / clip.speed)) * width
            return (
              <button
                key={k.id}
                type="button"
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 pointer-events-auto text-yellow-400 hover:text-yellow-300"
                style={{ left: keyframeX }}
                onClick={(e) => {
                  e.stopPropagation()
                  onKeyframeClick?.(clip.startMicros + k.atMicros)
                }}
                aria-label={`Keyframe ${k.property}`}
                title={`${k.property} @ ${(k.atMicros / 1_000_000).toFixed(2)}s`}
              >
                ◇
              </button>
            )
          })}
        </div>
      )}
      <span className="relative truncate px-1.5 pt-0.5 text-[0.6875rem] font-medium text-white drop-shadow">
        {clip.text?.content ?? asset?.originalName ?? 'Clip'}
      </span>
      {!locked && (
        <>
          <div
            data-trim-handle="start"
            onPointerDown={(e) => beginDrag('trim-start', e)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute top-0 left-0 h-full cursor-ew-resize bg-white/0 hover:bg-white/20"
            style={{ width: HANDLE_WIDTH_PX, touchAction: 'none' }}
          />
          <div
            data-trim-handle="end"
            onPointerDown={(e) => beginDrag('trim-end', e)}
            onPointerMove={onPointerMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
            className="absolute top-0 right-0 h-full cursor-ew-resize bg-white/0 hover:bg-white/20"
            style={{ width: HANDLE_WIDTH_PX, touchAction: 'none' }}
          />
        </>
      )}
    </div>
  )
}

const MAX_WAVEFORM_BARS = 120

function WaveformBars({ peaks }: { peaks: Float32Array }) {
  const stride = Math.max(1, Math.ceil(peaks.length / MAX_WAVEFORM_BARS))
  const bars: number[] = []
  for (let i = 0; i < peaks.length; i += stride) {
    let max = 0
    for (let j = i; j < Math.min(peaks.length, i + stride); j++) max = Math.max(max, peaks[j])
    bars.push(max)
  }
  return (
    <div className="absolute inset-x-0 bottom-0 flex h-1/2 items-end gap-px px-0.5 opacity-80">
      {bars.map((peak, i) => (
        <div key={i} className="min-w-px flex-1 bg-white/70" style={{ height: `${Math.max(4, peak * 100)}%` }} />
      ))}
    </div>
  )
}
