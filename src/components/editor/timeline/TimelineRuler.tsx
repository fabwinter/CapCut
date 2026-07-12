import { useRef } from 'react'
import { timeToPx } from '#/editor/doc/selectors/layout'
import { secondsToMicros } from '#/editor/doc/time'

export const RULER_HEIGHT_PX = 28

interface TimelineRulerProps {
  pxPerSecond: number
  widthPx: number
  onScrub: (micros: number) => void
}

/** Adaptive tick spacing: pick the smallest "nice" interval that stays >= 64px apart. */
function pickTickSeconds(pxPerSecond: number): number {
  const niceIntervals = [0.1, 0.2, 0.5, 1, 2, 5, 10, 30, 60, 120, 300, 600]
  for (const seconds of niceIntervals) {
    if (seconds * pxPerSecond >= 64) return seconds
  }
  return niceIntervals.at(-1)!
}

function formatTime(seconds: number): string {
  const totalMs = Math.round(seconds * 1000)
  const m = Math.floor(totalMs / 60_000)
  const s = Math.floor((totalMs % 60_000) / 1000)
  const ms = totalMs % 1000
  if (ms !== 0) return `${m}:${s.toString().padStart(2, '0')}.${Math.floor(ms / 100)}`
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function TimelineRuler({ pxPerSecond, widthPx, onScrub }: TimelineRulerProps) {
  const ref = useRef<HTMLDivElement>(null)
  const tickSeconds = pickTickSeconds(pxPerSecond)
  const tickCount = Math.ceil(widthPx / (tickSeconds * pxPerSecond)) + 1

  function scrubAt(clientX: number) {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    const x = clientX - rect.left
    onScrub(secondsToMicros(Math.max(0, x / pxPerSecond)))
  }

  return (
    <div
      ref={ref}
      data-timeline-ruler
      className="border-border bg-card/60 relative border-b select-none"
      style={{ height: RULER_HEIGHT_PX, width: widthPx, touchAction: 'none' }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId)
        scrubAt(e.clientX)
      }}
      onPointerMove={(e) => {
        if (e.buttons === 0 && e.pointerType === 'mouse') return
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        scrubAt(e.clientX)
      }}
    >
      {Array.from({ length: tickCount }, (_, i) => {
        const seconds = i * tickSeconds
        const x = timeToPx(secondsToMicros(seconds), pxPerSecond)
        return (
          <div key={i} className="absolute top-0 h-full" style={{ left: x }}>
            <div className="bg-border absolute bottom-0 h-2 w-px" />
            <span className="text-muted-foreground absolute top-0.5 left-1 text-[0.625rem] tabular-nums">
              {formatTime(seconds)}
            </span>
          </div>
        )
      })}
    </div>
  )
}
