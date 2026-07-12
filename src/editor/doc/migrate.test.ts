import { describe, expect, it } from 'vitest'
import { CURRENT_SCHEMA_VERSION, createEmptyProjectDoc } from './schema'
import { migrateProjectDoc, UnmigratableProjectError } from './migrate'

describe('migrateProjectDoc', () => {
  it('passes a current-version doc through unchanged (schema-valid)', () => {
    const doc = createEmptyProjectDoc('P')
    const migrated = migrateProjectDoc(doc)
    expect(migrated).toEqual(doc)
  })

  it('throws UnmigratableProjectError for a schema version it does not recognize', () => {
    const doc = { ...createEmptyProjectDoc('P'), schemaVersion: CURRENT_SCHEMA_VERSION + 1 }
    expect(() => migrateProjectDoc(doc)).toThrow(UnmigratableProjectError)
  })

  it('throws UnmigratableProjectError when schemaVersion is missing entirely', () => {
    const { schemaVersion, ...rest } = createEmptyProjectDoc('P')
    void schemaVersion
    expect(() => migrateProjectDoc(rest)).toThrow(UnmigratableProjectError)
  })

  it('throws UnmigratableProjectError for non-object input', () => {
    expect(() => migrateProjectDoc(null)).toThrow(UnmigratableProjectError)
    expect(() => migrateProjectDoc('not a doc')).toThrow(UnmigratableProjectError)
    expect(() => migrateProjectDoc(42)).toThrow(UnmigratableProjectError)
  })

  it('rejects a doc with the right schemaVersion but invalid shape (zod validation still runs)', () => {
    const doc = { ...createEmptyProjectDoc('P'), tracks: 'not-an-array' }
    expect(() => migrateProjectDoc(doc)).toThrow()
  })

  it('reports the offending version on the error', () => {
    const doc = { ...createEmptyProjectDoc('P'), schemaVersion: 999 }
    try {
      migrateProjectDoc(doc)
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(UnmigratableProjectError)
      expect((err as UnmigratableProjectError).foundVersion).toBe(999)
    }
  })
})
