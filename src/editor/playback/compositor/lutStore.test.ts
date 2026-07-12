import { describe, expect, it } from 'vitest'
import { BUILTIN_LUTS, isBuiltinLutId } from './lutStore'

describe('isBuiltinLutId', () => {
  it('accepts every id in BUILTIN_LUTS', () => {
    for (const id of BUILTIN_LUTS) expect(isBuiltinLutId(id)).toBe(true)
  })

  it('rejects unknown ids', () => {
    expect(isBuiltinLutId('not-a-real-lut')).toBe(false)
  })
})
