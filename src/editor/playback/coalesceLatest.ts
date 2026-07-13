/**
 * Wraps an async `fn` so that calling the wrapper while a previous call's
 * promise is still pending is a no-op instead of starting a second overlapping
 * call. The next call after the in-flight one settles always runs — there's
 * no queued backlog of skipped calls to work through, so a caller that polls
 * on a timer (rAF, setInterval) naturally throttles to `fn`'s own completion
 * rate under load instead of piling up concurrent calls faster than `fn` can
 * finish them.
 *
 * This is what keeps `Transport.tick()` (firing every animation frame) from
 * launching a new video-frame render before the previous one's decode has
 * finished — see the caller for what goes wrong without it.
 */
export function coalesceLatest<Args extends unknown[]>(fn: (...args: Args) => Promise<void>): (...args: Args) => void {
  let inFlight = false
  return (...args: Args) => {
    if (inFlight) return
    inFlight = true
    void fn(...args).finally(() => {
      inFlight = false
    })
  }
}
