import type { Effect } from '#/editor/doc/schema'

export interface Adjustments {
  brightness: number
  contrast: number
  saturation: number
  temperature: number
  vignette: number
}

export const NEUTRAL_ADJUSTMENTS: Adjustments = {
  brightness: 0,
  contrast: 1,
  saturation: 1,
  temperature: 0,
  vignette: 0,
}

/** Folds a clip's effect stack into the uniform values the compositor's shader expects. */
export function computeAdjustments(effects: Effect[]): Adjustments {
  const result = { ...NEUTRAL_ADJUSTMENTS }
  for (const effect of effects) {
    if (effect.type in result) {
      result[effect.type as keyof Adjustments] = effect.params.value ?? result[effect.type as keyof Adjustments]
    }
  }
  return result
}
