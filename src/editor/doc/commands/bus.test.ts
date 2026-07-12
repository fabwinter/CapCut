import { describe, expect, it, vi } from 'vitest'
import { createEmptyProjectDoc } from '../schema'
import { CommandBus } from './bus'
import { renameProject, setProjectSettings } from './project'

describe('CommandBus', () => {
  it('applies a command and updates the doc', () => {
    const bus = new CommandBus(createEmptyProjectDoc('Original'))
    bus.dispatch(renameProject('Renamed'))
    expect(bus.getDoc().name).toBe('Renamed')
  })

  it('undoes and redoes a command', () => {
    const bus = new CommandBus(createEmptyProjectDoc('Original'))
    bus.dispatch(renameProject('Renamed'))

    expect(bus.canUndo()).toBe(true)
    bus.undo()
    expect(bus.getDoc().name).toBe('Original')
    expect(bus.canUndo()).toBe(false)
    expect(bus.canRedo()).toBe(true)

    bus.redo()
    expect(bus.getDoc().name).toBe('Renamed')
  })

  it('clears the redo stack on a new dispatch after undo', () => {
    const bus = new CommandBus(createEmptyProjectDoc('Original'))
    bus.dispatch(renameProject('A'))
    bus.undo()
    bus.dispatch(renameProject('B'))
    expect(bus.canRedo()).toBe(false)
    expect(bus.getDoc().name).toBe('B')
  })

  it('does not record history for a no-op command', () => {
    const bus = new CommandBus(createEmptyProjectDoc('Same'))
    bus.dispatch(renameProject('Same'))
    expect(bus.canUndo()).toBe(false)
  })

  it('merges partial settings without touching untouched fields', () => {
    const bus = new CommandBus(createEmptyProjectDoc('P'))
    const before = bus.getDoc().settings.height
    bus.dispatch(setProjectSettings({ fps: 60 }))
    expect(bus.getDoc().settings.fps).toBe(60)
    expect(bus.getDoc().settings.height).toBe(before)
  })

  it('notifies onChange with each entry', () => {
    const onChange = vi.fn()
    const bus = new CommandBus(createEmptyProjectDoc('P'), { onChange })
    bus.dispatch(renameProject('Q'))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange.mock.calls[0][1]?.name).toBe('RenameProject')
  })

  it('bounds the undo history to maxHistory entries', () => {
    const bus = new CommandBus(createEmptyProjectDoc('P'), { maxHistory: 3 })
    for (let i = 0; i < 5; i++) bus.dispatch(renameProject(`P${i}`))
    let undone = 0
    while (bus.canUndo()) {
      bus.undo()
      undone++
    }
    expect(undone).toBe(3)
  })
})
