import type { Micros } from '../doc/time'
import { secondsToMicros } from '../doc/time'

/**
 * Transport state machine for playback control.
 * Manages play/pause/seek and frame timing.
 */
export class Transport {
  private isPlaying = false
  private currentTimeMicros: Micros = 0
  private durationMicros: Micros
  private audioContext: AudioContext
  private startTimeAudio: number = 0
  private startTimeMicros: Micros = 0
  // fps: reserved for future frame-boundary snapping
  // private fps: number

  // Listeners
  private onTimeUpdate: ((time: Micros) => void) | null = null
  private onPlayStateChange: ((playing: boolean) => void) | null = null

  private rafId: number | null = null

  constructor(durationMicros: Micros, _fps: number) {
    this.durationMicros = durationMicros
    // fps reserved for future frame-boundary snapping
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
  }

  /**
   * Start playback.
   */
  play(): void {
    if (this.isPlaying) return

    this.isPlaying = true
    this.startTimeAudio = this.audioContext.currentTime
    this.startTimeMicros = this.currentTimeMicros

    this.onPlayStateChange?.(true)
    this.scheduleNextFrame()
  }

  /**
   * Pause playback.
   */
  pause(): void {
    if (!this.isPlaying) return

    this.isPlaying = false
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }

    this.onPlayStateChange?.(false)
  }

  /**
   * Seek to a specific time.
   */
  seek(timeMicros: Micros): void {
    this.currentTimeMicros = Math.max(0, Math.min(timeMicros, this.durationMicros))

    if (this.isPlaying) {
      // Resume from new position
      this.startTimeAudio = this.audioContext.currentTime
      this.startTimeMicros = this.currentTimeMicros
    }

    this.onTimeUpdate?.(this.currentTimeMicros)
  }

  /**
   * Get current playback position.
   */
  getCurrentTime(): Micros {
    if (!this.isPlaying) {
      return this.currentTimeMicros
    }

    // Calculate elapsed time from audio clock
    const elapsedAudio = this.audioContext.currentTime - this.startTimeAudio
    const elapsedMicros = secondsToMicros(elapsedAudio)
    this.currentTimeMicros = Math.min(
      this.startTimeMicros + elapsedMicros,
      this.durationMicros
    )

    return this.currentTimeMicros
  }

  /**
   * Set callback for time updates.
   */
  onTimeChange(callback: (time: Micros) => void): void {
    this.onTimeUpdate = callback
  }

  /**
   * Set callback for play state changes.
   */
  onPlayStateChanged(callback: (playing: boolean) => void): void {
    this.onPlayStateChange = callback
  }

  /**
   * Schedule the next frame render (via requestAnimationFrame).
   */
  private scheduleNextFrame(): void {
    if (!this.isPlaying) return

    this.rafId = requestAnimationFrame(() => {
      const currentTime = this.getCurrentTime()

      if (currentTime >= this.durationMicros) {
        // End of playback
        this.pause()
        this.onTimeUpdate?.(this.durationMicros)
      } else {
        this.onTimeUpdate?.(currentTime)
        this.scheduleNextFrame()
      }
    })
  }

  /**
   * Get playback state.
   */
  get playing(): boolean {
    return this.isPlaying
  }

  /**
   * Stop playback and reset.
   */
  stop(): void {
    this.pause()
    this.currentTimeMicros = 0
    this.onTimeUpdate?.(0)
  }

  /**
   * Close audio context resources.
   */
  close(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId)
      this.rafId = null
    }
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close()
    }
  }
}
