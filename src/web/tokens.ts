/** Colour tokens of the site. Light is the default; dark is used by the device setting or by the reader's choice. */
export type ThemeMode = 'light' | 'dark'
export type ThemeToken = 'bg' | 'surface' | 'text' | 'muted' | 'line' | 'accent' | 'onAccent' | 'error'

export const THEME_TOKENS: Record<ThemeMode, Record<ThemeToken, string>> = {
  light: {
    bg: '#ffffff',
    surface: '#f5f5f7',
    text: '#1d1d1f',
    muted: '#6e6e73',
    line: '#e5e5ea',
    accent: '#0066cc',
    onAccent: '#ffffff',
    error: '#b3261e',
  },
  dark: {
    bg: '#000000',
    surface: '#1c1c1e',
    text: '#f5f5f7',
    muted: '#a1a1a6',
    line: '#2c2c2e',
    accent: '#2997ff',
    onAccent: '#000000',
    error: '#ff8a80',
  },
}

const vars = (mode: ThemeMode): string =>
  Object.entries(THEME_TOKENS[mode])
    .map(([name, value]) => `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}:${value}`)
    .join(';')

/**
 * Light by default; dark follows the device unless the reader chose light (`data-theme="light"`);
 * `data-theme="dark"` forces dark. The dark block is repeated on purpose: a forced dark needs it too.
 */
export const THEME_CSS = `:root{color-scheme:light;${vars('light')}}
@media (prefers-color-scheme:dark){:root:not([data-theme="light"]){color-scheme:dark;${vars('dark')}}}
:root[data-theme="dark"]{color-scheme:dark;${vars('dark')}}`
