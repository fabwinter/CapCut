import { useCallback, useEffect, useState } from 'react'
import {
  createEmptyProjectDoc,
  type ProjectDoc,
} from '#/editor/doc/schema'
import { deleteProjectDoc, listProjects, saveProject } from '#/storage/idb'
import { copyProjectAssets, deleteProjectAssets } from '#/storage/opfs'

/** Client-only: drives the project gallery off IndexedDB. */
export function useProjects() {
  const [projects, setProjects] = useState<ProjectDoc[] | null>(null)

  const refresh = useCallback(async () => {
    setProjects(await listProjects())
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const createProject = useCallback(async (name: string) => {
    const doc = createEmptyProjectDoc(name)
    await saveProject(doc)
    await refresh()
    return doc
  }, [refresh])

  const renameProjectById = useCallback(
    async (id: string, name: string) => {
      const doc = projects?.find((p) => p.id === id)
      if (!doc) return
      await saveProject({ ...doc, name, modifiedAt: Date.now() })
      await refresh()
    },
    [projects, refresh],
  )

  const duplicateProject = useCallback(
    async (id: string) => {
      const doc = projects?.find((p) => p.id === id)
      if (!doc) return
      const now = Date.now()
      const copy: ProjectDoc = {
        ...doc,
        id: crypto.randomUUID(),
        name: `${doc.name} copy`,
        createdAt: now,
        modifiedAt: now,
      }
      await saveProject(copy)
      await copyProjectAssets(doc.id, copy.id)
      await refresh()
      return copy
    },
    [projects, refresh],
  )

  const removeProject = useCallback(
    async (id: string) => {
      await deleteProjectDoc(id)
      await deleteProjectAssets(id)
      await refresh()
    },
    [refresh],
  )

  return {
    projects,
    isLoading: projects === null,
    createProject,
    renameProject: renameProjectById,
    duplicateProject,
    removeProject,
    refresh,
  }
}
