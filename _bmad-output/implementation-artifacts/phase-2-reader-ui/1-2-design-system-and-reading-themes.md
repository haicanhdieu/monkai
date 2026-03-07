# Story 1.2: Design System & Reading Themes

Status: done

## Story

As a **developer**,
I want Tailwind configured with Monkai's design tokens and three reading themes defined as CSS custom properties,
So that all future components use consistent, accessible colors and typography from the start.

## Acceptance Criteria

1. **Given** `tailwind.config.ts`
   **When** a component uses `bg-kem`, `text-nau-tram`, or `text-vang-dat`
   **Then** the colors resolve to `#F5EDD6`, `#3D2B1F`, and `#C8883A` respectively

2. **Given** `index.css` with `.theme-sepia`, `.theme-light`, `.theme-dark` CSS custom property blocks
   **When** one of those classes is applied to the `<html>` element
   **Then** all themed CSS custom properties (`--color-background`, `--color-text`, `--color-accent`) update accordingly across all consuming components

3. **Given** Lora and Inter font files in `public/fonts/`
   **When** `index.css` declares `@font-face` for each
   **Then** Lora uses `font-display: block` and Inter uses `font-display: swap`

4. **Given** all three reading themes
   **When** a Vitest test checks each theme's text-to-background contrast ratio
   **Then** all three pass WCAG AA minimum 4.5:1 contrast ratio

## Tasks / Subtasks

- [ ] Task 1: Configure Tailwind CSS with Monkai design tokens (AC: #1)
  - [ ] Subtask 1.1: Create `apps/reader/tailwind.config.ts` (TypeScript format, Tailwind v3)
  - [ ] Subtask 1.2: Add color tokens: `kem: '#F5EDD6'`, `nau-tram: '#3D2B1F'` (note: use `'nau-tram'` as key), `vang-dat: '#C8883A'`
  - [ ] Subtask 1.3: Add extended typography scale: `fontFamily: { serif: ['Lora', 'Georgia', 'serif'], sans: ['Inter', 'system-ui', 'sans-serif'] }`
  - [ ] Subtask 1.4: Configure `content` paths: `['./index.html', './src/**/*.{ts,tsx}']`
  - [ ] Subtask 1.5: Create `apps/reader/postcss.config.js` with tailwindcss and autoprefixer plugins
  - [ ] Subtask 1.6: Import Tailwind in `apps/reader/src/index.css`: `@tailwind base; @tailwind components; @tailwind utilities;`

- [ ] Task 2: Define reading themes as CSS custom properties (AC: #2)
  - [ ] Subtask 2.1: In `index.css`, define `:root` baseline custom properties
  - [ ] Subtask 2.2: Define `.theme-sepia` block with sepia color values (warm parchment: bg `#F5EDD6`, text `#3D2B1F`, accent `#C8883A`)
  - [ ] Subtask 2.3: Define `.theme-light` block (clean white: bg `#FFFFFF`, text `#1A1A1A`, accent `#C8883A`)
  - [ ] Subtask 2.4: Define `.theme-dark` block (dark reading: bg `#1A1207`, text `#E8D5B0`, accent `#D4944A`)
  - [ ] Subtask 2.5: Ensure all three themes define: `--color-background`, `--color-text`, `--color-text-muted`, `--color-accent`, `--color-surface`, `--color-border`
  - [ ] Subtask 2.6: Add Tailwind CSS custom property utilities so components can use `bg-[var(--color-background)]` or extend config with semantic tokens referencing custom properties

- [ ] Task 3: Self-host fonts in `public/fonts/` (AC: #3)
  - [ ] Subtask 3.1: Download Lora font files (Regular, Italic, Bold, BoldItalic) and place in `apps/reader/public/fonts/`
  - [ ] Subtask 3.2: Download Inter font files (Regular, Medium, SemiBold) and place in `apps/reader/public/fonts/`
  - [ ] Subtask 3.3: In `index.css`, declare `@font-face` for Lora with `font-display: block` (critical: pagination measures real glyphs)
  - [ ] Subtask 3.4: In `index.css`, declare `@font-face` for Inter with `font-display: swap` (UI font — swap acceptable)
  - [ ] Subtask 3.5: Add `.gitattributes` entry for `public/fonts/*.woff2 binary` if needed

- [ ] Task 4: Write WCAG contrast Vitest test (AC: #4)
  - [ ] Subtask 4.1: Create `apps/reader/src/shared/theme.test.ts` (or `theme-contrast.test.ts`)
  - [ ] Subtask 4.2: Import or define a `getContrastRatio(fg: string, bg: string): number` utility using relative luminance formula (W3C algorithm)
  - [ ] Subtask 4.3: Write test: for each of the 3 themes, check `--color-text` vs `--color-background` contrast ratio ≥ 4.5
  - [ ] Subtask 4.4: Run `pnpm test` and confirm all 3 contrast assertions pass
  - [ ] Subtask 4.5: The test should be pure JS/TS (no DOM needed) — compute luminance from hex values directly

## Dev Notes

### tailwind.config.ts

Use TypeScript format (Tailwind v3):

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Monkai brand palette
        kem: '#F5EDD6',           // Parchment cream — sepia theme background
        'nau-tram': '#3D2B1F',   // Dark brown — sepia theme text
        'vang-dat': '#C8883A',   // Earth gold — accent color all themes
      },
      fontFamily: {
        serif: ['Lora', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config
```

### CSS Custom Properties in index.css

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Font faces */
@font-face {
  font-family: 'Lora';
  src: url('/fonts/Lora-Regular.woff2') format('woff2');
  font-weight: 400;
  font-style: normal;
  font-display: block; /* CRITICAL: ensures pagination measures real font metrics */
}
@font-face {
  font-family: 'Lora';
  src: url('/fonts/Lora-Italic.woff2') format('woff2');
  font-weight: 400;
  font-style: italic;
  font-display: block;
}
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter-Regular.woff2') format('woff2');
  font-weight: 400;
  font-display: swap; /* UI font — layout shift acceptable */
}
@font-face {
  font-family: 'Inter';
  src: url('/fonts/Inter-Medium.woff2') format('woff2');
  font-weight: 500;
  font-display: swap;
}

/* Sepia (default reading theme — warm, Buddhist aesthetic) */
.theme-sepia {
  --color-background: #F5EDD6;
  --color-text: #3D2B1F;
  --color-text-muted: #7A5C42;
  --color-accent: #C8883A;
  --color-surface: #EDE0C4;
  --color-border: #D4C4A0;
}

/* Light (clean white) */
.theme-light {
  --color-background: #FFFFFF;
  --color-text: #1A1A1A;
  --color-text-muted: #6B6B6B;
  --color-accent: #C8883A;
  --color-surface: #F5F5F5;
  --color-border: #E0E0E0;
}

/* Dark (night reading) */
.theme-dark {
  --color-background: #1A1207;
  --color-text: #E8D5B0;
  --color-text-muted: #B8A07C;
  --color-accent: #D4944A;
  --color-surface: #2A1E0F;
  --color-border: #3D2B1F;
}

/* Apply theme to body text and background by default */
body {
  background-color: var(--color-background);
  color: var(--color-text);
  font-family: 'Inter', system-ui, sans-serif;
}
```

### WCAG Contrast Test

```typescript
// src/shared/theme-contrast.test.ts
import { describe, it, expect } from 'vitest'

function hexToRgb(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)!
  return [
    parseInt(result[1], 16),
    parseInt(result[2], 16),
    parseInt(result[3], 16),
  ]
}

function relativeLuminance(r: number, g: number, b: number): number {
  const [rs, gs, bs] = [r, g, b].map(c => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs
}

function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(...hexToRgb(hex1))
  const l2 = relativeLuminance(...hexToRgb(hex2))
  const lighter = Math.max(l1, l2)
  const darker = Math.min(l1, l2)
  return (lighter + 0.05) / (darker + 0.05)
}

const themes = {
  sepia:  { text: '#3D2B1F', background: '#F5EDD6' },
  light:  { text: '#1A1A1A', background: '#FFFFFF' },
  dark:   { text: '#E8D5B0', background: '#1A1207' },
}

describe('Reading theme WCAG AA contrast', () => {
  Object.entries(themes).forEach(([name, { text, background }]) => {
    it(`${name} theme passes WCAG AA (≥4.5:1)`, () => {
      const ratio = contrastRatio(text, background)
      expect(ratio).toBeGreaterThanOrEqual(4.5)
    })
  })
})
```

### Font Files

Download from Google Fonts or Fontsource. Preferred approach using Fontsource (self-hosting):
```bash
# From apps/reader
pnpm add @fontsource/lora @fontsource/inter
```
Then copy woff2 files to `public/fonts/` from `node_modules/@fontsource/*/files/`.

Alternatively, download directly from Google Fonts using `google-fonts-helper` or manually. The WOFF2 format is required (all modern browsers support it).

### Critical Note: font-display: block for Lora

The pagination engine (Story 3.1) measures actual text height to split pages. If `font-display: swap` is used on Lora, the engine may measure fallback font dimensions instead of Lora's actual metrics, causing incorrect page breaks.

`font-display: block` ensures the font is fully loaded before any text is rendered — which is why `ReaderEngine` additionally gates behind `document.fonts.ready` (see Architecture doc).

### Theme Application Pattern

Themes are applied to the `<html>` element (not `<body>`):
```typescript
// From useTheme hook (Story 1.3)
document.documentElement.className = `theme-${theme}`
```
This ensures CSS custom properties cascade to all descendants including the SW-served offline.html.

### Project Structure Notes

Files created/modified in this story:
- `apps/reader/tailwind.config.ts` — NEW
- `apps/reader/postcss.config.js` — NEW
- `apps/reader/src/index.css` — MODIFIED (add font-face + theme blocks)
- `apps/reader/public/fonts/` — NEW directory with woff2 files
- `apps/reader/src/shared/theme-contrast.test.ts` — NEW

No feature-level components are created in this story. Design tokens are infrastructure only.

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 1.2]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Gap Analysis — Gap 2 Tailwind version]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Gap Analysis — Gap 4 Font loading strategy]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Implementation Patterns — Theme Application]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/ux-design-specification-reader-ui.md]
- [WCAG 2.1 Success Criterion 1.4.3: Contrast (Minimum)](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
