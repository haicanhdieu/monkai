# Story 3.3: Themes and Font Size Inside epub.js

Status: ready-for-dev

## Story

As a reader user,
I want my chosen theme (Day/Sepia/Dark) and font size to apply inside the reader,
so that my reading preferences take effect in the epub.js content, not just the app chrome.

## Acceptance Criteria

1. **Given** `features/reader/epubThemes.ts` is created with `EPUB_THEMES` constants
   **When** the file is reviewed
   **Then** it defines CSS property objects for `theme-light`, `theme-sepia`, and `theme-dark` covering at minimum `body` (background, color, fontFamily: Lora) and `p` (lineHeight, margin)
   **And** all three themes meet WCAG AA contrast (≥ 4.5:1) for body text

2. **Given** the epub.js rendition is ready
   **When** `useEpubReader` initialises after `isReady`
   **Then** all three themes are registered via `rendition.themes.register(name, styles)` for each entry in `EPUB_THEMES`
   **And** the current theme from `settings.store` is applied via `rendition.themes.select(currentTheme)`

3. **Given** the user changes their theme in Settings
   **When** `settings.store.setTheme(newTheme)` is called
   **Then** `rendition.themes.select(newTheme)` is called in response (via a `useEffect` watching the theme value)
   **And** the rendered EPUB content visually updates to the new theme without a page reload

4. **Given** the user changes their font size in Settings
   **When** `settings.store.setFontSize(newSize)` is called
   **Then** `rendition.themes.fontSize(${newSize}px)` is called
   **And** font size is NOT applied via CSS on the outer container div

5. **Given** the user sets font size to 200% of the base size
   **When** the reader renders
   **Then** text remains readable and layout does not overflow or break

6. **Given** the app is restarted
   **When** the reader opens
   **Then** the previously saved theme and font size are read from `settings.store` (hydrated via `useStorageHydration`) and applied to epub.js on rendition ready

## Tasks / Subtasks

- [ ] Create `src/features/reader/epubThemes.ts` with `EPUB_THEMES` constants (AC: 1)
  - [ ] Define `theme-light`, `theme-sepia`, `theme-dark` CSS objects
  - [ ] Verify contrast ratios: light (bg #ffffff / text #1a1a1a ≥ 4.5:1 ✓), sepia (bg #f4ecd8 / text #3b2f2f ≥ 4.5:1), dark (bg #1a1a1a / text #e0d9cc ≥ 4.5:1)
- [ ] Register themes and apply initial theme in `useEpubReader.ts` (AC: 2, 6)
  - [ ] Import `EPUB_THEMES` from `epubThemes.ts`
  - [ ] Accept optional `theme` and `fontSize` parameters (or read from settings store inside the hook)
  - [ ] After rendition is created, register all themes: `Object.entries(EPUB_THEMES).forEach(([name, styles]) => rendition.themes.register(name, styles))`
  - [ ] After `isReady` (in the `ready` event handler), call `rendition.themes.select(currentTheme)` and `rendition.themes.fontSize(${fontSize}px)`
- [ ] Wire theme and font size changes in `ReaderEngine.tsx` (AC: 3, 4, 5)
  - [ ] Add `useEffect` watching `theme` from `settings.store`: call `rendition?.themes.select(theme)` when it changes
  - [ ] Add `useEffect` watching `fontSize` from `settings.store`: call `rendition?.themes.fontSize(${fontSize}px)` when it changes
  - [ ] These effects should only run when `rendition` is non-null
- [ ] Verify `settings.store` interface for theme and fontSize (AC: 3, 4)
  - [ ] Check `src/stores/settings.store.ts` for theme values (`'theme-light'`, `'theme-sepia'`, `'theme-dark'`)
  - [ ] Ensure the theme key names match `EPUB_THEMES` keys exactly
- [ ] Update `useEpubReader.ts` signature if needed to accept theme/fontSize or read from store (AC: 2, 6)
- [ ] Add basic test: themes registered when rendition ready, theme change triggers `themes.select` (AC: 2, 3)

## Dev Notes

### Codebase Context

**Prerequisites:** Stories 2.1 (useEpubReader), 2.2 (ReaderEngine rewrite).

**`settings.store.ts`** — Check the current theme and fontSize interface:
```typescript
// Expected shape (from architecture docs):
interface UserSettings {
  theme: 'theme-light' | 'theme-sepia' | 'theme-dark'
  fontSize: number  // in px, e.g. 16
}
```
Read the actual `src/stores/settings.store.ts` to confirm the field names and types match.

**`epubThemes.ts` authoritative constants:**
```typescript
// src/features/reader/epubThemes.ts
export const EPUB_THEMES = {
  'theme-light': {
    body: { background: '#ffffff', color: '#1a1a1a', fontFamily: 'Lora, serif' },
    p: { lineHeight: '1.8', margin: '0 0 1em 0' },
  },
  'theme-sepia': {
    body: { background: '#f4ecd8', color: '#3b2f2f', fontFamily: 'Lora, serif' },
    p: { lineHeight: '1.8', margin: '0 0 1em 0' },
  },
  'theme-dark': {
    body: { background: '#1a1a1a', color: '#e0d9cc', fontFamily: 'Lora, serif' },
    p: { lineHeight: '1.8', margin: '0 0 1em 0' },
  },
} as const

export type EpubThemeName = keyof typeof EPUB_THEMES
```

**WCAG AA contrast verification:**
- `theme-light`: #ffffff (bg) / #1a1a1a (text) → contrast ratio ≈ 16.75:1 ✅
- `theme-sepia`: #f4ecd8 (bg) / #3b2f2f (text) → contrast ratio ≈ 9.7:1 ✅
- `theme-dark`: #1a1a1a (bg) / #e0d9cc (text) → contrast ratio ≈ 11.5:1 ✅

**epub.js `rendition.themes` API:**
```typescript
// Register all themes (do this once after rendition is created, before display())
Object.entries(EPUB_THEMES).forEach(([name, styles]) => {
  rendition.themes.register(name, styles)
})

// Select current theme (after isReady)
rendition.themes.select('theme-sepia')  // theme name must match registered key

// Set font size (after isReady)
rendition.themes.fontSize('18px')  // string with units

// On theme change (useEffect in ReaderEngine watching settings.store.theme):
useEffect(() => {
  if (!rendition) return
  rendition.themes.select(theme)
}, [rendition, theme])

// On font size change (useEffect in ReaderEngine watching settings.store.fontSize):
useEffect(() => {
  if (!rendition) return
  rendition.themes.fontSize(`${fontSize}px`)
}, [rendition, fontSize])
```

**CRITICAL anti-patterns:**
```typescript
// ❌ WRONG: applying font size on the outer container
<div style={{ fontSize: `${fontSize}px` }} ref={containerRef} />
// Font size on the outer div does NOT affect epub.js iframe content

// ❌ WRONG: CSS injection via getContents
rendition.getContents().forEach(c => c.addStylesheetRules({ body: { fontSize: `${fontSize}px` } }))
// This is the deprecated API; use rendition.themes instead

// ✅ CORRECT: always via rendition.themes API
rendition.themes.select('theme-dark')
rendition.themes.fontSize('20px')
```

**Where to register themes:** In `useEpubReader`, after creating the rendition but before calling `display()`. The registration step is synchronous. However, `select()` may need to happen after `isReady` (after the rendition has rendered its first page) — test this.

**Alternative: Pass theme/fontSize to `useEpubReader`:**
Instead of having `ReaderEngine` call `rendition.themes.select()` directly, extend `useEpubReader` to accept `theme` and `fontSize` and apply them internally:
```typescript
function useEpubReader(epubUrl: string | null, options?: { theme?: string; fontSize?: number }): UseEpubReaderResult
```
This keeps all epub.js API calls inside the hook (cleaner boundary). But it requires the hook to read or accept theme/fontSize and use `useEffect` internally.

**Recommended architecture:** Have `useEpubReader` register themes on rendition creation (one-time). Have `ReaderEngine` apply the current theme and respond to changes via `useEffect` — this keeps the hook stateless w.r.t. preferences while respecting the "epub.js only in useEpubReader" constraint.

**Wait — constraint re-check:** The architecture says "Import epub.js only via useEpubReader hook." But `rendition.themes.select()` calls the `rendition` object which is returned from `useEpubReader`. Calling methods on `rendition` (returned from the hook) in `ReaderEngine` is fine — it's not importing `epubjs` directly. The ESLint rule restricts `import from 'epubjs'`, not usage of returned objects.

So: `ReaderEngine` can call `rendition.themes.select(theme)` and `rendition.themes.fontSize(...)` directly using the `rendition` ref returned by `useEpubReader`. No ESLint violation.

**`settings.store` hooks pattern:**
```typescript
// In ReaderEngine.tsx:
import { useSettingsStore } from '@/stores/settings.store'

const { theme, fontSize } = useSettingsStore()
```

### Project Structure Notes

- New file: `src/features/reader/epubThemes.ts`
- Modified files: `src/features/reader/useEpubReader.ts` (register themes on rendition creation), `src/features/reader/ReaderEngine.tsx` (theme/fontSize useEffects)

### Testing Standards

- Test theme registration: mock `rendition.themes.register` and verify all 3 themes registered
- Test initial theme selection: verify `rendition.themes.select(initialTheme)` called on ready
- Test theme change: update mock `theme` value, verify `rendition.themes.select(newTheme)` called
- Test fontSize change: update mock `fontSize`, verify `rendition.themes.fontSize(...)` called
- Do NOT test contrast ratios in unit tests — document the calculated values in code comments

### References

- Architecture theming: [Source: architecture-reader-ui-epubjs.md#Frontend Architecture — Theming in the epub.js iframe]
- `EPUB_THEMES` constants: [Source: architecture-reader-ui-epubjs.md#Frontend Architecture]
- Anti-patterns: [Source: architecture-reader-ui-epubjs.md#Communication Patterns — Theming authoritative pattern]
- Enforcement: [Source: architecture-reader-ui-epubjs.md#Enforcement Guidelines]
- Settings store: [Source: apps/reader/src/stores/settings.store.ts]
- Epics AC: [Source: epics-reader-ui-epubjs.md#Story 3.3 Acceptance Criteria]

## Dev Agent Record

### Agent Model Used

{{agent_model_name_version}}

### Debug Log References

### Completion Notes List

### File List
