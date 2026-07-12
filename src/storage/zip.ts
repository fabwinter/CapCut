/**
 * A minimal ZIP reader/writer — STORE method only (no compression). Good
 * enough for a project backup archive where the payload is already-encoded
 * video/image data (compressing it again buys nothing) and a small JSON
 * doc. Avoids pulling in a general-purpose zip dependency for one use case.
 */

export interface ZipEntry {
  path: string
  data: Uint8Array
}

const LOCAL_FILE_SIGNATURE = 0x04034b50
const CENTRAL_DIR_SIGNATURE = 0x02014b50
const END_OF_CENTRAL_DIR_SIGNATURE = 0x06054b50
const STORE_METHOD = 0

let crcTable: Uint32Array | undefined
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (0xedb88320 ^ (c >>> 1)) : c >>> 1
    }
    table[n] = c >>> 0
  }
  crcTable = table
  return table
}

export function crc32(data: Uint8Array): number {
  const table = getCrcTable()
  let crc = 0xffffffff
  for (let i = 0; i < data.length; i++) {
    crc = table[(crc ^ data[i]) & 0xff] ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function textEncode(s: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new TextEncoder().encode(s))
}

/** Builds a STORE-only ZIP archive from in-memory entries. */
export function buildZip(entries: ZipEntry[]): Blob {
  const parts: BlobPart[] = []
  const centralRecords: BlobPart[] = []
  let offset = 0

  for (const entry of entries) {
    const nameBytes = textEncode(entry.path)
    const crc = crc32(entry.data)
    const size = entry.data.length

    const localHeader = new DataView(new ArrayBuffer(30))
    localHeader.setUint32(0, LOCAL_FILE_SIGNATURE, true)
    localHeader.setUint16(4, 20, true) // version needed
    localHeader.setUint16(6, 0, true) // flags
    localHeader.setUint16(8, STORE_METHOD, true)
    localHeader.setUint16(10, 0, true) // mod time
    localHeader.setUint16(12, 0, true) // mod date
    localHeader.setUint32(14, crc, true)
    localHeader.setUint32(18, size, true) // compressed size
    localHeader.setUint32(22, size, true) // uncompressed size
    localHeader.setUint16(26, nameBytes.length, true)
    localHeader.setUint16(28, 0, true) // extra length

    parts.push(localHeader.buffer, nameBytes, new Uint8Array(entry.data))

    const centralHeader = new DataView(new ArrayBuffer(46))
    centralHeader.setUint32(0, CENTRAL_DIR_SIGNATURE, true)
    centralHeader.setUint16(4, 20, true) // version made by
    centralHeader.setUint16(6, 20, true) // version needed
    centralHeader.setUint16(8, 0, true) // flags
    centralHeader.setUint16(10, STORE_METHOD, true)
    centralHeader.setUint16(12, 0, true) // mod time
    centralHeader.setUint16(14, 0, true) // mod date
    centralHeader.setUint32(16, crc, true)
    centralHeader.setUint32(20, size, true)
    centralHeader.setUint32(24, size, true)
    centralHeader.setUint16(28, nameBytes.length, true)
    centralHeader.setUint16(30, 0, true) // extra length
    centralHeader.setUint16(32, 0, true) // comment length
    centralHeader.setUint16(34, 0, true) // disk number
    centralHeader.setUint16(36, 0, true) // internal attrs
    centralHeader.setUint32(38, 0, true) // external attrs
    centralHeader.setUint32(42, offset, true) // local header offset

    centralRecords.push(centralHeader.buffer, nameBytes)

    offset += 30 + nameBytes.length + size
  }

  const centralDirStart = offset
  let centralDirSize = 0
  for (const record of centralRecords) {
    centralDirSize += record instanceof Uint8Array ? record.length : (record as ArrayBuffer).byteLength
  }

  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, END_OF_CENTRAL_DIR_SIGNATURE, true)
  end.setUint16(4, 0, true) // disk number
  end.setUint16(6, 0, true) // disk with central dir
  end.setUint16(8, entries.length, true) // entries on this disk
  end.setUint16(10, entries.length, true) // total entries
  end.setUint32(12, centralDirSize, true)
  end.setUint32(16, centralDirStart, true)
  end.setUint16(20, 0, true) // comment length

  return new Blob([...parts, ...centralRecords, end.buffer], { type: 'application/zip' })
}

/** Parses a STORE-only ZIP archive back into in-memory entries. */
export async function parseZip(blob: Blob): Promise<ZipEntry[]> {
  const buffer = new Uint8Array(await blob.arrayBuffer())
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength)
  const entries: ZipEntry[] = []
  let offset = 0

  while (offset + 4 <= buffer.length && view.getUint32(offset, true) === LOCAL_FILE_SIGNATURE) {
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const method = view.getUint16(offset + 8, true)
    if (method !== STORE_METHOD) throw new Error('Unsupported zip compression method (expected STORE)')

    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const path = new TextDecoder().decode(buffer.subarray(nameStart, nameStart + nameLength))
    const data = buffer.slice(dataStart, dataStart + compressedSize)
    entries.push({ path, data })

    offset = dataStart + compressedSize
  }

  return entries
}
