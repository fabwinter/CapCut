import { describe, expect, it } from 'vitest'
import { buildZip, crc32, parseZip } from './zip'

describe('crc32', () => {
  it('matches a known reference value', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })

  it('is deterministic for empty input', () => {
    expect(crc32(new Uint8Array())).toBe(0)
  })
})

describe('buildZip / parseZip round trip', () => {
  it('round-trips a single small text entry', async () => {
    const data = new TextEncoder().encode('{"hello":"world"}')
    const blob = buildZip([{ path: 'project.json', data }])
    const entries = await parseZip(blob)
    expect(entries).toHaveLength(1)
    expect(entries[0].path).toBe('project.json')
    expect(new TextDecoder().decode(entries[0].data)).toBe('{"hello":"world"}')
  })

  it('round-trips multiple entries including binary data and nested paths', async () => {
    const binary = new Uint8Array(2000)
    for (let i = 0; i < binary.length; i++) binary[i] = i % 256

    const blob = buildZip([
      { path: 'project.json', data: new TextEncoder().encode('{}') },
      { path: 'assets/abc-123/original', data: binary },
      { path: 'assets/def-456/original', data: new Uint8Array([1, 2, 3]) },
    ])
    const entries = await parseZip(blob)
    expect(entries).toHaveLength(3)
    expect(entries.map((e) => e.path)).toEqual([
      'project.json',
      'assets/abc-123/original',
      'assets/def-456/original',
    ])
    expect(entries[1].data).toEqual(binary)
    expect(Array.from(entries[2].data)).toEqual([1, 2, 3])
  })

  it('round-trips an empty entry list', async () => {
    const blob = buildZip([])
    const entries = await parseZip(blob)
    expect(entries).toHaveLength(0)
  })

  it('preserves exact byte content for a zero-length file', async () => {
    const blob = buildZip([{ path: 'empty.bin', data: new Uint8Array() }])
    const entries = await parseZip(blob)
    expect(entries[0].data.length).toBe(0)
  })
})
