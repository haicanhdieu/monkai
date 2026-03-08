import type { CSSProperties } from 'react'

/** Shared gradient style for book cover placeholders (no cover image or load error). */
export const coverPlaceholderStyle: CSSProperties = {
  background:
    'linear-gradient(140deg, var(--color-border) 0%, var(--color-surface) 55%, var(--color-accent) 100%)',
}
