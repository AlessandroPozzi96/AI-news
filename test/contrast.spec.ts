import { describe, expect, it } from 'vitest'
import { THEME_TOKENS, type ThemeMode, type ThemeToken } from '../src/web/tokens'

/** WCAG 2.x relative luminance of an #rrggbb colour. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
  const [r, g, b] = channels.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Text on background pairs used by the pages: WCAG AA requires 4.5:1 for body text. */
const PAIRS: [ThemeToken, ThemeToken][] = [
  ['text', 'bg'],
  ['muted', 'bg'],
  ['accent', 'bg'],
  ['error', 'bg'],
  ['onAccent', 'accent'],
  ['text', 'surface'],
  ['muted', 'surface'],
]

describe('theme contrast', () => {
  for (const mode of ['light', 'dark'] as ThemeMode[]) {
    it(`meets WCAG AA (4.5:1) for text in ${mode} mode`, () => {
      for (const [fg, bg] of PAIRS) {
        const ratio = contrast(THEME_TOKENS[mode][fg], THEME_TOKENS[mode][bg])
        expect(ratio, `${mode}: ${fg} on ${bg}`).toBeGreaterThanOrEqual(4.5)
      }
    })
  }

  it('uses a white light background and a black dark background', () => {
    expect(THEME_TOKENS.light.bg).toBe('#ffffff')
    expect(THEME_TOKENS.dark.bg).toBe('#000000')
  })
})
