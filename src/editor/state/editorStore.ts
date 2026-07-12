import { create } from 'zustand'
import { CommandBus } from '#/editor/doc/commands/bus'
import type { Command } from '#/editor/doc/commands/types'
import type { ProjectDoc } from '#/editor/doc/schema'
import { saveProject } from '#/storage/idb'

const AUTOSAVE_DEBOUNCE_MS = 500

interface EditorState {
  doc: ProjectDoc | null
  canUndo: boolean
  canRedo: boolean
  isDirty: boolean
  isSaving: boolean
  openProject: (doc: ProjectDoc) => void
  dispatch: (command: Command) => void
  undo: () => void
  redo: () => void
  closeProject: () => void
}

// A single editor is open at a time in this SPA, so the bus and its debounce
// timer live as module state rather than inside the zustand store itself.
let bus: CommandBus | null = null
let saveTimer: ReturnType<typeof setTimeout> | null = null

function syncFromBus(set: (partial: Partial<EditorState>) => void, dirty: boolean) {
  if (!bus) return
  set({ doc: bus.getDoc(), canUndo: bus.canUndo(), canRedo: bus.canRedo(), isDirty: dirty })
}

/**
 * Writes the current doc immediately, bypassing the debounce. Used both when
 * the debounce timer elapses and to flush a pending save on navigating away,
 * so an edit is never silently dropped just because the debounce window
 * hadn't elapsed yet.
 */
function flushAutosave(get: () => EditorState, set: (partial: Partial<EditorState>) => void) {
  if (saveTimer) {
    clearTimeout(saveTimer)
    saveTimer = null
  }
  const doc = get().doc
  if (!doc) return
  set({ isSaving: true })
  saveProject(doc)
    .then(() => {
      // Another edit may have landed while this write was in flight (its own
      // debounce timer is already scheduled to save that) — only clear the
      // dirty flag if the doc we just persisted is still the current one.
      set(get().doc === doc ? { isSaving: false, isDirty: false } : { isSaving: false })
    })
    .catch(() => set({ isSaving: false }))
}

function scheduleAutosave(get: () => EditorState, set: (partial: Partial<EditorState>) => void) {
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(() => flushAutosave(get, set), AUTOSAVE_DEBOUNCE_MS)
}

export const useEditorStore = create<EditorState>((set, get) => ({
  doc: null,
  canUndo: false,
  canRedo: false,
  isDirty: false,
  isSaving: false,

  openProject: (doc) => {
    bus = new CommandBus(doc)
    set({ doc, canUndo: false, canRedo: false, isDirty: false, isSaving: false })
  },

  dispatch: (command) => {
    bus?.dispatch(command)
    syncFromBus(set, true)
    scheduleAutosave(get, set)
  },

  undo: () => {
    bus?.undo()
    syncFromBus(set, true)
    scheduleAutosave(get, set)
  },

  redo: () => {
    bus?.redo()
    syncFromBus(set, true)
    scheduleAutosave(get, set)
  },

  closeProject: () => {
    if (get().isDirty) flushAutosave(get, set)
    bus = null
    set({ doc: null, canUndo: false, canRedo: false, isDirty: false, isSaving: false })
  },
}))
