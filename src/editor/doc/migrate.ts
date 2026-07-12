import { CURRENT_SCHEMA_VERSION, ProjectDocSchema, type ProjectDoc } from './schema'

export class UnmigratableProjectError extends Error {
  constructor(public readonly foundVersion: unknown) {
    super(`Cannot open project: unknown schema version ${JSON.stringify(foundVersion)}`)
  }
}

/**
 * Brings a persisted document up to CURRENT_SCHEMA_VERSION before it enters
 * the app. There is only one version today; future migrations add a case
 * here that transforms `raw` one version at a time and falls through, rather
 * than a version jump straight to current.
 */
export function migrateProjectDoc(raw: unknown): ProjectDoc {
  const version = (raw as { schemaVersion?: unknown } | null)?.schemaVersion

  if (version !== CURRENT_SCHEMA_VERSION) {
    throw new UnmigratableProjectError(version)
  }

  return ProjectDocSchema.parse(raw)
}
