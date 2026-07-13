import type { Command } from './types'
import type { TextPayload, EffectType, TransitionType } from '../schema'

/**
 * Update text content and styling.
 */
export function setClipText(clipId: string, text: Partial<TextPayload>): Command {
  return {
    name: 'SetClipText',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip || !clip.text) return

      let changed = false
      const current = clip.text

      if (text.content !== undefined && current.content !== text.content) {
        current.content = text.content
        changed = true
      }
      if (text.fontFamily !== undefined && current.fontFamily !== text.fontFamily) {
        current.fontFamily = text.fontFamily
        changed = true
      }
      if (text.fontSize !== undefined && current.fontSize !== text.fontSize) {
        current.fontSize = Math.max(8, Math.min(120, text.fontSize))
        changed = true
      }
      if (text.color !== undefined && current.color !== text.color) {
        current.color = text.color
        changed = true
      }
      if (text.strokeColor !== undefined && current.strokeColor !== text.strokeColor) {
        current.strokeColor = text.strokeColor
        changed = true
      }
      if (text.strokeWidth !== undefined && current.strokeWidth !== text.strokeWidth) {
        current.strokeWidth = Math.max(0, text.strokeWidth)
        changed = true
      }
      if (text.align !== undefined && current.align !== text.align) {
        current.align = text.align
        changed = true
      }
      if (text.animationIn !== undefined && current.animationIn !== text.animationIn) {
        current.animationIn = text.animationIn
        changed = true
      }
      if (text.animationOut !== undefined && current.animationOut !== text.animationOut) {
        current.animationOut = text.animationOut
        changed = true
      }

      if (changed) {
        draft.modifiedAt = Date.now()
      }
    },
  }
}

/**
 * Add or update a filter/effect on a clip.
 */
export function setClipEffect(
  clipId: string,
  effectType: EffectType,
  params: Record<string, number>,
  lutAssetId?: string
): Command {
  return {
    name: 'SetClipEffect',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      // Find existing effect of this type
      let effect = clip.effects.find((e: any) => e.type === effectType)

      if (!effect) {
        // Create new effect
        effect = {
          id: crypto.randomUUID(),
          type: effectType,
          params,
          lutAssetId,
        }
        clip.effects.push(effect)
      } else {
        // Update existing effect
        effect.params = params
        if (lutAssetId) {
          effect.lutAssetId = lutAssetId
        }
      }

      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Remove an effect from a clip.
 */
export function removeClipEffect(clipId: string, effectType: EffectType): Command {
  return {
    name: 'RemoveClipEffect',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      const idx = clip.effects.findIndex((e: any) => e.type === effectType)
      if (idx !== -1) {
        clip.effects.splice(idx, 1)
        draft.modifiedAt = Date.now()
      }
    },
  }
}

/**
 * Set a transition on the end of a clip.
 * Transition plays between this clip and the next on the same track.
 */
export function setClipTransition(
  clipId: string,
  transitionType: TransitionType,
  durationMicros: number
): Command {
  return {
    name: 'SetClipTransition',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      if (durationMicros <= 0) {
        clip.transitionOut = undefined
      } else {
        clip.transitionOut = {
          type: transitionType,
          durationMicros,
        }
      }

      draft.modifiedAt = Date.now()
    },
  }
}

/**
 * Remove transition from a clip.
 */
export function removeClipTransition(clipId: string): Command {
  return {
    name: 'RemoveClipTransition',
    recipe: (draft) => {
      const clip = findClipById(draft, clipId)
      if (!clip) return

      if (clip.transitionOut) {
        clip.transitionOut = undefined
        draft.modifiedAt = Date.now()
      }
    },
  }
}

/**
 * Helper: find a clip by ID across all tracks.
 */
function findClipById(draft: any, clipId: string): any {
  for (const track of draft.tracks) {
    const clip = track.clips.find((c: any) => c.id === clipId)
    if (clip) return clip
  }
  return null
}
