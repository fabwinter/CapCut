import { useMemo } from 'react'
import type { Micros } from '#/editor/doc/time'
import { microsToSeconds } from '#/editor/doc/time'

interface TimelineRulerProps {
  durationMicros: Micros
  pxPerSecond: number
  scrollLeft: number
}

/**
 * Adaptive time ruler showing major/minor tick marks.
 * At different zoom levels, the tick interval changes to keep the UI readable.
 */
export function TimelineRuler({ durationMicros, pxPerSecond, scrollLeft }: TimelineRulerProps) {
  const ticks = useMemo(() => {
    // Decide tick interval based on zoom level
    // At 100 px/s: 1 second ticks, at 50 px/s: 2 second ticks, etc.
    const interval = calculateTickInterval(pxPerSecond)
    const durationSeconds = microsToSeconds(durationMicros)
    const ticks = []

    for (let i = 0; i <= durationSeconds; i += interval) {
      ticks.push({ seconds: i, isMajor: i % (interval * 5) === 0 })
    }
    return ticks
  }, [durationMicros, pxPerSecond])

  const visibleTicks = useMemo(() => {
    const viewportStartPx = scrollLeft
    const viewportEndPx = scrollLeft + 800 // Approximate timeline width

    return ticks.filter((tick) => {
      const tickPx = tick.seconds * pxPerSecond
      return tickPx >= viewportStartPx - 100 && tickPx <= viewportEndPx + 100
    })
  }, [ticks, scrollLeft, pxPerSecond])

  return (
    <div className="relative h-8 border-b border-border/50 bg-muted/30">
      <div className="relative flex h-full">
        {visibleTicks.map((tick) => {
          const x = tick.seconds * pxPerSecond - scrollLeft
          const height = tick.isMajor ? 8 : 4
          const label = tick.isMajor ? formatSeconds(tick.seconds) : ''

          return (
            <div
              key={`${tick.seconds}`}
              className="absolute flex flex-col items-center"
              style={{ left: `${x}px` }}
            >
              <div
                className="bg-muted-foreground w-px"
                style={{ height: `${height}px` }}
              />
              {label && (
                <span
                  className="text-muted-foreground pointer-events-none text-xs leading-none"
                  style={{ paddingTop: '2px' }}
                >
                  {label}
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function calculateTickInterval(pxPerSecond: number): number {
  // Returns interval in seconds
  // At very low zoom (< 25 px/s): 10 second ticks
  // At low zoom (25-50): 5 second ticks
  // At medium zoom (50-150): 1 second ticks
  // At high zoom (150+): 0.5 second ticks
  if (pxPerSecond < 25) return 10
  if (pxPerSecond < 50) return 5
  if (pxPerSecond < 150) return 1
  return 0.5
}

function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${String(secs).padStart(2, '0')}`
}
