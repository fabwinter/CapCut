import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { migrateProjectDoc } from '#/editor/doc/migrate'
import type { ProjectDoc } from '#/editor/doc/schema'

interface CapCutDB extends DBSchema {
  projects: {
    key: string
    value: ProjectDoc
    indexes: { 'by-modified': number }
  }
}

const DB_NAME = 'capcut-ipad'
const DB_VERSION = 1
const STORE = 'projects'

let dbPromise: Promise<IDBPDatabase<CapCutDB>> | undefined

function getDb(): Promise<IDBPDatabase<CapCutDB>> {
  dbPromise ??= openDB<CapCutDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      const store = db.createObjectStore(STORE, { keyPath: 'id' })
      store.createIndex('by-modified', 'modifiedAt')
    },
  })
  return dbPromise
}

export async function saveProject(doc: ProjectDoc): Promise<void> {
  const db = await getDb()
  await db.put(STORE, doc)
}

export async function loadProject(id: string): Promise<ProjectDoc | undefined> {
  const db = await getDb()
  const raw = await db.get(STORE, id)
  return raw ? migrateProjectDoc(raw) : undefined
}

/** Most recently modified first. */
export async function listProjects(): Promise<ProjectDoc[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex(STORE, 'by-modified')
  return all.reverse().map(migrateProjectDoc)
}

export async function deleteProjectDoc(id: string): Promise<void> {
  const db = await getDb()
  await db.delete(STORE, id)
}
