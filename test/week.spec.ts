import { describe, expect, it } from 'vitest'
import { ISSUE_ID_PATTERN, weekNumber } from '../src/issues/week'

describe('issue ids', () => {
  it('reads the week of automatic and manual (suffixed) ids', () => {
    expect(weekNumber('2026-S45')).toBe(45)
    expect(weekNumber('2026-S45-2')).toBe(45)
    expect(weekNumber('2026-S05-12')).toBe(5)
  })

  it('accepts automatic and manual ids only', () => {
    for (const ok of ['2026-S45', '2026-S45-2', '2026-S45-12']) expect(ISSUE_ID_PATTERN.test(ok)).toBe(true)
    for (const bad of ['2026-S45-', '2026-S45-0', '2026-S4', '2026-S45-2-3', '2026-S45-2x', 'x']) {
      expect(ISSUE_ID_PATTERN.test(bad)).toBe(false)
    }
  })
})
