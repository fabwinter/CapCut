import { useState } from 'react'
import type { Transition } from '#/editor/doc/schema'
import { pxToTime, timeToPx } from '#/editor/doc/selectors/layout'
import type { Micros } from '#/editor/doc/time'

const MIN_DURATION_MICROS = 100_000
const HANDLE_WIDTH_PX = 8

export interface TransitionMarkerProps {
  clipId: string
  transition: Transition
  /** Timeline position where the outgoing clip ends and the next clip starts — the transition spans backward from here into the outgoing clip's tail. */
  boundaryMicros: Micros
  /** `min(outgoing clip duration, incoming clip duration)` — the transition can never be longer than the shorter of the two clips it blends. */
  maxDurationMicros: Micros
  y: number
  height: number
  pxPerSecond: number
  onSelect: (clipId: string) => void
  onDurationCommit: (clipId: string, durationMicros: Micros) => void
}

/** A draggable marker over the boundary between two clips with a transition — shows and resizes `clipId`'s `transitionOut.durationMicros`. */
export function TransitionMarker(props: TransitionMarkerProps) {
  const { clipId, transition, boundaryMicros, maxDurationMicros, y, height, pxPerSecond, onSelect, onDurationCommit } = props
  const [dragDurationMicros, setDragDurationMicros] = useState<Micros | null>(null)
  const [dragPointerId, setDragPointerId] = useState<number | null>(null)

  const durationMicros = dragDurationMicros ?? transition.durationMicros
  const boundaryPx = timeToPx(boundaryMicros, pxPerSecond)
  const widthPx = Math.max(4, timeToPx(durationMicros, pxPerSecond))

  function beginDrag(e: React.PointerEvent) {
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDragPointerId(e.pointerId)
    setDragDurationMicros(transition.durationMicros)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragPointerId === null || e.pointerId !== dragPointerId) return
    const rect = e.currentTarget.closest('[data-timeline-content]')?.getBoundingClientRect()
    const pointerX = rect ? e.clientX - rect.left : 0
    const candidateStart = pxToTime(pointerX, pxPerSecond)
    const candidateDuration = boundaryMicros - candidateStart
    setDragDurationMicros(Math.max(MIN_DURATION_MICROS, Math.min(maxDurationMicros, candidateDuration)))
  }

  function endDrag(e: React.PointerEvent) {
    if (dragPointerId === null || e.pointerId !== dragPointerId) return
    if (dragDurationMicros !== null) onDurationCommit(clipId, dragDurationMicros)
    setDragDurationMicros(null)
    setDragPointerId(null)
  }

  return (
    <div
      data-transition-marker
      data-clip-id={clipId}
      data-dragging={dragPointerId !== null}
      className="absolute z-10 flex cursor-pointer items-center justify-center rounded-full border border-amber-300/80 bg-amber-400/40 shadow-sm"
      style={{ left: boundaryPx - widthPx, top: y + height / 2 - 8, width: widthPx, height: 16 }}
      onPointerDown={(e) => {
        e.stopPropagation()
        onSelect(clipId)
      }}
    >
      <div
        data-transition-resize-handle
        onPointerDown={beginDrag}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        className="h-full cursor-ew-resize rounded-l-full bg-amber-200/70 hover:bg-amber-100"
        style={{ width: HANDLE_WIDTH_PX, touchAction: 'none' }}
      />
    </div>
  )
}
