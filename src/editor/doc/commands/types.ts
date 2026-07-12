import type { Draft } from 'immer'
import type { ProjectDoc } from '../schema'

/**
 * Every document mutation is a Command, not a setter. `recipe` is an Immer
 * producer — mutate `draft` directly. The bus turns that into a patch +
 * inverse patch, which is what makes undo/redo (and future sync) possible.
 */
export interface Command {
  /** Human-readable name, surfaced in undo history / debug logging. */
  name: string
  recipe: (draft: Draft<ProjectDoc>) => void
}
