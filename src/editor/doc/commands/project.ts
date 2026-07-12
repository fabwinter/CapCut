import type { ProjectSettings } from '../schema'
import type { Command } from './types'

export function renameProject(name: string): Command {
  return {
    name: 'RenameProject',
    recipe: (draft) => {
      draft.name = name
      draft.modifiedAt = Date.now()
    },
  }
}

export function setProjectSettings(settings: Partial<ProjectSettings>): Command {
  return {
    name: 'SetProjectSettings',
    recipe: (draft) => {
      Object.assign(draft.settings, settings)
      draft.modifiedAt = Date.now()
    },
  }
}
