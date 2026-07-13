import { describe, expect, it, vi } from 'vitest'
import { coalesceLatest } from './coalesceLatest'

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

describe('coalesceLatest', () => {
  it('skips calls that arrive while a previous call is still in flight', async () => {
    vi.useFakeTimers()
    const calls: number[] = []
    const slow = async (n: number) => {
      calls.push(n)
      await delay(50)
    }
    const coalesced = coalesceLatest(slow)

    // Simulates rAF firing every 16ms while a "decode" takes 50ms — exactly
    // the regime that livelocked before this fix (a decode-latency-bound
    // async op called from a much faster fixed-interval loop).
    coalesced(1)
    await vi.advanceTimersByTimeAsync(16)
    coalesced(2) // call 1 still in flight — must be dropped, not queued
    await vi.advanceTimersByTimeAsync(16)
    coalesced(3) // still in flight — dropped
    await vi.advanceTimersByTimeAsync(20) // call 1 finishes at t=50
    coalesced(4) // now free — must run

    await vi.advanceTimersByTimeAsync(60)
    expect(calls).toEqual([1, 4])
    vi.useRealTimers()
  })

  it('makes forward progress indefinitely even when every call is slower than the polling interval', async () => {
    vi.useFakeTimers()
    const calls: number[] = []
    const slow = async (n: number) => {
      calls.push(n)
      await delay(30)
    }
    const coalesced = coalesceLatest(slow)

    // A tick loop that fires far faster than `slow` can complete, for a while.
    for (let t = 0; t < 200; t += 5) {
      coalesced(t)
      await vi.advanceTimersByTimeAsync(5)
    }

    // If every call were being discarded (the livelock this fixes), calls
    // would still be empty or stuck at length 1. Real progress means several
    // calls actually ran to completion across the 200ms window.
    expect(calls.length).toBeGreaterThanOrEqual(4)
    vi.useRealTimers()
  })

  it('runs the next call immediately once nothing is in flight', async () => {
    const calls: number[] = []
    const fast = async (n: number) => {
      calls.push(n)
    }
    const coalesced = coalesceLatest(fast)

    coalesced(1)
    await Promise.resolve()
    await Promise.resolve()
    coalesced(2)
    await Promise.resolve()
    await Promise.resolve()

    expect(calls).toEqual([1, 2])
  })
})
