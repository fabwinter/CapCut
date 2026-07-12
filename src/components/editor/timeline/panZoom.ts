import { type RefObject, useCallback, useRef } from 'react'
import { clampZoom, pxToTime, timeToPx } from '#/editor/doc/selectors/layout'

interface PanZoomOptions {
  containerRef: RefObject<HTMLDivElement | null>
  pxPerSecond: number
  setPxPerSecond: (next: number) => void
}

interface ActivePointer {
  x: number
  y: number
}

/**
 * Owns pan (drag on empty timeline background) and pinch-zoom (two pointers)
 * for the tracks scroll area. The container has `touch-action: none` so we
 * see every pointer event ourselves instead of fighting native touch
 * scrolling — panning/zooming are then just `scrollLeft`/`scrollTop` writes,
 * which the container's native scrollbars and overflow clipping still honor.
 */
export function usePanZoom({ containerRef, pxPerSecond, setPxPerSecond }: PanZoomOptions) {
  const pointers = useRef(new Map<number, ActivePointer>())
  const lastPinchDistance = useRef<number | null>(null)
  const zoomRef = useRef(pxPerSecond)
  zoomRef.current = pxPerSecond

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      const container = containerRef.current
      if (!container) return
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
      container.setPointerCapture(e.pointerId)
      if (pointers.current.size === 2) {
        lastPinchDistance.current = pinchDistance(pointers.current)
      }
    },
    [containerRef],
  )

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const container = containerRef.current
      if (!container || !pointers.current.has(e.pointerId)) return
      const previous = pointers.current.get(e.pointerId)!
      const current = { x: e.clientX, y: e.clientY }
      pointers.current.set(e.pointerId, current)

      if (pointers.current.size === 2) {
        const distance = pinchDistance(pointers.current)
        const previousDistance = lastPinchDistance.current
        lastPinchDistance.current = distance
        if (previousDistance && previousDistance > 0) {
          const ratio = distance / previousDistance
          const rect = container.getBoundingClientRect()
          const mid = pinchMidpoint(pointers.current)
          const midOffsetX = mid.x - rect.left
          const oldZoom = zoomRef.current
          const timeAtMid = pxToTime(container.scrollLeft + midOffsetX, oldZoom)
          const newZoom = clampZoom(oldZoom * ratio)
          zoomRef.current = newZoom
          setPxPerSecond(newZoom)
          container.scrollLeft = timeToPx(timeAtMid, newZoom) - midOffsetX
        }
        return
      }

      if (pointers.current.size === 1) {
        container.scrollLeft -= current.x - previous.x
        container.scrollTop -= current.y - previous.y
      }
    },
    [containerRef, setPxPerSecond],
  )

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) lastPinchDistance.current = null
  }, [])

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp }
}

function pinchDistance(pointers: Map<number, ActivePointer>): number {
  const [a, b] = [...pointers.values()]
  return Math.hypot(a.x - b.x, a.y - b.y)
}

function pinchMidpoint(pointers: Map<number, ActivePointer>): ActivePointer {
  const [a, b] = [...pointers.values()]
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}
