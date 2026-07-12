import type { ProjectSettings } from '../schema'
import type { Command } from './types'

export function renameProject(name: string): Command {
  return {
    name: 'RenameProject',
    recipe: (draft) => {
      // Guard, don't just rely on CommandBus's "zero patches" no-op check:
      // unconditionally bumping modifiedAt would itself be a real patch even
      // when the name doesn't change, defeating that check.
      if (draft.name === name) return
      draft.name = name
      draft.modifiedAt = Date.now()
    },
  }
}

export function setProjectSettings(settings: Partial<ProjectSettings>): Command {
  return {
    name: 'SetProjectSettings',
    recipe: (draft) => {
      let changed = false
      for (const key of Object.keys(settings) as (keyof ProjectSettings)[]) {
        const value = settings[key]
        if (value !== undefined && draft.settings[key] !== value) {
          // @ts-expect-error -- key/value are correlated by the loop over `settings`, but TS can't express that per-key link across a union of fields with different types
          draft.settings[key] = value
          changed = true
        }
      }
      if (changed) draft.modifiedAt = Date.now()
    },
  }
}
