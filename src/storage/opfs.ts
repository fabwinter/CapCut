/**
 * Origin Private File System helpers. All imported media lives here — never
 * in the ProjectDoc, which only ever holds an `opfsPath` pointing into this
 * tree. Layout: /projects/{projectId}/assets/{assetId}/{original,proxy,...}
 */

async function getRootDir(): Promise<FileSystemDirectoryHandle> {
  return navigator.storage.getDirectory()
}

async function getSubdir(
  parent: FileSystemDirectoryHandle,
  name: string,
  create: boolean,
): Promise<FileSystemDirectoryHandle> {
  return parent.getDirectoryHandle(name, { create })
}

export async function getProjectDir(
  projectId: string,
  create = true,
): Promise<FileSystemDirectoryHandle> {
  const root = await getRootDir()
  const projects = await getSubdir(root, 'projects', create)
  return getSubdir(projects, projectId, create)
}

export async function getAssetDir(
  projectId: string,
  assetId: string,
  create = true,
): Promise<FileSystemDirectoryHandle> {
  const projectDir = await getProjectDir(projectId, create)
  const assets = await getSubdir(projectDir, 'assets', create)
  return getSubdir(assets, assetId, create)
}

export async function writeFile(
  dir: FileSystemDirectoryHandle,
  name: string,
  data: Blob | ArrayBuffer | ReadableStream<Uint8Array>,
): Promise<void> {
  const handle = await dir.getFileHandle(name, { create: true })
  const writable = await handle.createWritable()
  if (data instanceof ReadableStream) {
    await data.pipeTo(writable)
  } else {
    await writable.write(data)
    await writable.close()
  }
}

export async function readFile(dir: FileSystemDirectoryHandle, name: string): Promise<File> {
  const handle = await dir.getFileHandle(name)
  return handle.getFile()
}

export async function fileExists(dir: FileSystemDirectoryHandle, name: string): Promise<boolean> {
  try {
    await dir.getFileHandle(name)
    return true
  } catch {
    return false
  }
}

/** Removes every asset stored for a project. Called when a project is deleted. */
export async function deleteProjectAssets(projectId: string): Promise<void> {
  const root = await getRootDir()
  const projects = await getSubdir(root, 'projects', true)
  await projects.removeEntry(projectId, { recursive: true }).catch(() => {
    // already gone — deleting a project whose assets were never written is fine
  })
}

async function dirSizeBytes(dir: FileSystemDirectoryHandle): Promise<number> {
  let total = 0
  for await (const [, handle] of dir.entries()) {
    if (handle.kind === 'file') {
      const file = await handle.getFile()
      total += file.size
    } else {
      total += await dirSizeBytes(handle)
    }
  }
  return total
}

export async function getProjectAssetsSizeBytes(projectId: string): Promise<number> {
  const projectDir = await getProjectDir(projectId, false).catch(() => undefined)
  if (!projectDir) return 0
  return dirSizeBytes(projectDir)
}

async function copyDirRecursive(
  from: FileSystemDirectoryHandle,
  to: FileSystemDirectoryHandle,
): Promise<void> {
  for await (const [name, handle] of from.entries()) {
    if (handle.kind === 'file') {
      const file = await handle.getFile()
      await writeFile(to, name, file)
    } else {
      const subTo = await getSubdir(to, name, true)
      await copyDirRecursive(handle, subTo)
    }
  }
}

/** Deep-copies every asset file from one project's OPFS tree to another's (used by "duplicate project"). */
export async function copyProjectAssets(fromProjectId: string, toProjectId: string): Promise<void> {
  const fromDir = await getProjectDir(fromProjectId, false).catch(() => undefined)
  if (!fromDir) return
  const toDir = await getProjectDir(toProjectId, true)
  await copyDirRecursive(fromDir, toDir)
}
