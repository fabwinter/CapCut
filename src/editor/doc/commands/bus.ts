import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer'
import type { ProjectDoc } from '../schema'
import type { Command } from './types'

enablePatches()

interface HistoryEntry {
  name: string
  patches: Patch[]
  inversePatches: Patch[]
}

export interface CommandBusOptions {
  /** Bounded undo stack — oldest entries drop off once exceeded. */
  maxHistory?: number
  onChange?: (doc: ProjectDoc, entry: HistoryEntry | null) => void
}

const DEFAULT_MAX_HISTORY = 200

/**
 * Owns one ProjectDoc and every mutation to it. Pure TypeScript, no React —
 * testable without a DOM and reusable from a worker if we ever need to.
 */
export class CommandBus {
  private doc: ProjectDoc
  private undoStack: HistoryEntry[] = []
  private redoStack: HistoryEntry[] = []
  private readonly maxHistory: number
  private readonly onChange: CommandBusOptions['onChange']

  constructor(doc: ProjectDoc, options: CommandBusOptions = {}) {
    this.doc = doc
    this.maxHistory = options.maxHistory ?? DEFAULT_MAX_HISTORY
    this.onChange = options.onChange
  }

  getDoc(): ProjectDoc {
    return this.doc
  }

  dispatch(command: Command): void {
    const [nextDoc, patches, inversePatches] = produceWithPatches(this.doc, command.recipe)

    // No-op commands (e.g. a drag that ends where it started) shouldn't
    // pollute undo history or trigger an autosave.
    if (patches.length === 0) return

    this.doc = nextDoc as ProjectDoc
    const entry: HistoryEntry = { name: command.name, patches, inversePatches }
    this.undoStack.push(entry)
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift()
    this.redoStack = []
    this.onChange?.(this.doc, entry)
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  undo(): void {
    const entry = this.undoStack.pop()
    if (!entry) return
    this.doc = applyPatches(this.doc, entry.inversePatches)
    this.redoStack.push(entry)
    this.onChange?.(this.doc, entry)
  }

  redo(): void {
    const entry = this.redoStack.pop()
    if (!entry) return
    this.doc = applyPatches(this.doc, entry.patches)
    this.undoStack.push(entry)
    this.onChange?.(this.doc, entry)
  }

  /** Loads a different document into this bus, clearing history. */
  reset(doc: ProjectDoc): void {
    this.doc = doc
    this.undoStack = []
    this.redoStack = []
  }
}
