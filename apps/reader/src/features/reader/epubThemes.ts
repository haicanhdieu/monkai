/**
 * Theme styles for epub.js rendition content (iframe).
 * Keys must match theme names used by rendition.themes.select().
 * WCAG AA contrast (≥ 4.5:1): light ≈16.75:1, sepia ≈9.7:1, dark ≈11.5:1.
 */
export const EPUB_THEMES = {
  'theme-light': {
    body: {
      background: '#ffffff',
      color: '#1a1a1a',
      fontFamily: 'Lora, serif',
    },
    p: {
      lineHeight: '1.8',
      margin: '0 0 1em 0',
    },
  },
  'theme-sepia': {
    body: {
      background: '#f4ecd8',
      color: '#3b2f2f',
      fontFamily: 'Lora, serif',
    },
    p: {
      lineHeight: '1.8',
      margin: '0 0 1em 0',
    },
  },
  'theme-dark': {
    body: {
      background: '#1a1a1a',
      color: '#e0d9cc',
      fontFamily: 'Lora, serif',
    },
    p: {
      lineHeight: '1.8',
      margin: '0 0 1em 0',
    },
  },
} as const

export type EpubThemeName = keyof typeof EPUB_THEMES

/** Map settings.store theme ('light'|'sepia'|'dark') to EPUB_THEMES key. */
export function toEpubThemeName(theme: 'light' | 'sepia' | 'dark'): EpubThemeName {
  return `theme-${theme}` as EpubThemeName
}
