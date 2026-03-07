# Story 1.4: PWA Manifest & App Shell Service Worker

Status: done

## Story

As a **user**,
I want to install Monkai to my home screen and open the app shell instantly without a network connection,
So that the app feels native and always available.

## Acceptance Criteria

1. **Given** `vite-plugin-pwa` configured with `generateSW` strategy
   **When** `vite build` runs
   **Then** `manifest.webmanifest` contains: `name: "Monkai"`, `display: "standalone"`, `theme_color: "#C8883A"`, `background_color: "#F5EDD6"`, icons at 192×192 and 512×512 (maskable)

2. **Given** Workbox precaches the app shell (HTML, JS, CSS, font files)
   **When** a user visits the app for the first time and the SW installs, then goes offline
   **Then** subsequent visits load the full app shell from cache with zero network requests

3. **Given** `public/offline.html` styled with Sepia theme colors
   **When** a user navigates to an uncached URL while offline
   **Then** the SW serves `offline.html` with a calm message and a link back to Home (`/`)

4. **Given** `public/_headers`
   **When** the app is served from GitHub Pages
   **Then** a `Content-Security-Policy` header is present

5. **Given** a new SW version is detected on revisit
   **When** the SW `waiting` event fires
   **Then** a subtle non-blocking prompt appears offering to reload — the app does not force-refresh automatically

## Tasks / Subtasks

- [ ] Task 1: Create PWA icons (AC: #1)
  - [ ] Subtask 1.1: Create `apps/reader/public/icons/` directory
  - [ ] Subtask 1.2: Create or generate `icon-192x192.png` (192×192px) — use a simple Buddha lotus or "M" letter mark in vàng đất on kem background
  - [ ] Subtask 1.3: Create or generate `icon-512x512.png` (512×512px)
  - [ ] Subtask 1.4: Create maskable icon variants: `icon-192x192-maskable.png` (with safe zone padding: content in center 80%)
  - [ ] Subtask 1.5: Create `favicon.ico` at 32×32 for browser tab

- [ ] Task 2: Configure `vite-plugin-pwa` in `vite.config.ts` (AC: #1, #2, #3)
  - [ ] Subtask 2.1: In `vite.config.ts`, expand the `VitePWA()` plugin config
  - [ ] Subtask 2.2: Set `registerType: 'prompt'` (not 'autoUpdate' — Story AC #5 requires user-prompted update)
  - [ ] Subtask 2.3: Set `strategies: 'generateSW'` (Workbox auto-generates SW)
  - [ ] Subtask 2.4: Configure `manifest` section with all required fields
  - [ ] Subtask 2.5: Configure `workbox` section for app shell precaching
  - [ ] Subtask 2.6: Add `offlineFallbackPage: '/offline.html'` to workbox config (served when fetch fails)
  - [ ] Subtask 2.7: Include font files in precache: add `globPatterns` to include `public/fonts/*.woff2`

- [ ] Task 3: Create `public/offline.html` (AC: #3)
  - [ ] Subtask 3.1: Create standalone HTML file (no external CSS or JS dependencies — must work with zero network)
  - [ ] Subtask 3.2: Inline Sepia theme styles: background `#F5EDD6`, text color `#3D2B1F`, accent `#C8883A`
  - [ ] Subtask 3.3: Display calm message in Vietnamese: "Bạn đang ngoại tuyến. Vui lòng kiểm tra kết nối mạng."
  - [ ] Subtask 3.4: Include a link back to home page (`<a href="/">Về trang chủ</a>`) using correct basename
  - [ ] Subtask 3.5: Style consistent with Monkai aesthetic (Lora font via CSS `@import` or fallback font-stack, centered layout)

- [ ] Task 4: Create `public/_headers` for CSP (AC: #4)
  - [ ] Subtask 4.1: Create `apps/reader/public/_headers` file
  - [ ] Subtask 4.2: Add path `/*` with `Content-Security-Policy` header
  - [ ] Subtask 4.3: CSP policy: `default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data:; connect-src 'self'`
  - [ ] Subtask 4.4: Note: `'unsafe-inline'` is needed for Vite-injected inline scripts and Tailwind's CSS-in-JS; tighten post-MVP with nonces if needed

- [ ] Task 5: Implement SW update prompt in App.tsx (AC: #5)
  - [ ] Subtask 5.1: Import `useRegisterSW` from `virtual:pwa-register/react` (provided by vite-plugin-pwa)
  - [ ] Subtask 5.2: In `App.tsx` or a dedicated `ServiceWorkerUpdater.tsx` component, call `useRegisterSW({ onNeedRefresh() {...} })`
  - [ ] Subtask 5.3: When `needRefresh` is true, render a subtle toast/banner: "Có phiên bản mới. [Tải lại]" — positioned at top of screen, non-blocking
  - [ ] Subtask 5.4: Tapping "Tải lại" calls `updateServiceWorker(true)` which triggers SW activation + page reload
  - [ ] Subtask 5.5: Tapping dismiss closes the banner without reloading (user can continue reading)
  - [ ] Subtask 5.6: Component should use CSS custom properties for theming (works across all 3 themes)

- [ ] Task 6: Verify PWA build output (AC: #1, #2)
  - [ ] Subtask 6.1: Run `pnpm build` — verify `dist/manifest.webmanifest` is generated
  - [ ] Subtask 6.2: Open `dist/manifest.webmanifest` and confirm all required fields match AC #1
  - [ ] Subtask 6.3: Inspect `dist/sw.js` — confirm it contains precache manifest with app shell assets
  - [ ] Subtask 6.4: Verify `dist/offline.html` exists in output

## Dev Notes

### vite.config.ts PWA Configuration

```typescript
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.VITE_BASE_PATH ?? '/',
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      proxy: env.VITE_BOOK_DATA_URL
        ? { '/book-data': { target: env.VITE_BOOK_DATA_URL, changeOrigin: true } }
        : {},
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        strategies: 'generateSW',
        includeAssets: ['favicon.ico', 'fonts/*.woff2', 'offline.html'],
        manifest: {
          name: 'Monkai',
          short_name: 'Monkai',
          description: 'Đọc kinh Phật — Buddhist sutra reader',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#C8883A',
          background_color: '#F5EDD6',
          lang: 'vi',
          start_url: env.VITE_BASE_PATH ?? '/',
          scope: env.VITE_BASE_PATH ?? '/',
          icons: [
            {
              src: '/icons/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/icons/icon-192x192-maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          // Precache all app shell assets
          globPatterns: ['**/*.{js,css,html,woff2,ico,png}'],
          // Offline fallback
          offlineFallbackPage: 'offline.html',
          // Cache-first for all precached assets
          runtimeCaching: [
            {
              // book-data JSON — cache-first (data is static from Phase 1)
              urlPattern: /\/book-data\/.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'book-data-cache',
                expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              },
            },
          ],
        },
        devOptions: {
          // Enable SW in dev for testing (off by default in Vite dev server)
          enabled: false,
        },
      }),
    ],
  }
})
```

### offline.html

```html
<!DOCTYPE html>
<html lang="vi" class="theme-sepia">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Monkai — Ngoại tuyến</title>
  <style>
    /* Inline all styles — no network access available */
    :root {
      --color-background: #F5EDD6;
      --color-text: #3D2B1F;
      --color-accent: #C8883A;
      --color-border: #D4C4A0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background-color: var(--color-background);
      color: var(--color-text);
      font-family: Georgia, 'Times New Roman', serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 2rem;
    }
    .container { max-width: 400px; }
    h1 { font-size: 2rem; margin-bottom: 1rem; }
    p { font-size: 1.1rem; line-height: 1.6; margin-bottom: 1.5rem; color: #7A5C42; }
    a {
      display: inline-block;
      padding: 0.75rem 2rem;
      background-color: var(--color-accent);
      color: #F5EDD6;
      text-decoration: none;
      border-radius: 0.5rem;
      font-size: 1rem;
    }
    a:hover { opacity: 0.9; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🪷</h1>
    <h1>Monkai</h1>
    <p>Bạn đang ngoại tuyến.<br/>Vui lòng kiểm tra kết nối mạng của bạn.</p>
    <a href="/">Về trang chủ</a>
  </div>
</body>
</html>
```

Note: The `href="/"` assumes base path `/`. For production on a subpath, this won't work perfectly — users can still navigate back by tapping the browser back button. This is an acceptable MVP tradeoff.

### SW Update Prompt Component

```tsx
// src/shared/components/SwUpdateBanner.tsx
import { useRegisterSW } from 'virtual:pwa-register/react'

export function SwUpdateBanner() {
  const { needRefresh: [needRefresh, setNeedRefresh], updateServiceWorker } = useRegisterSW()

  if (!needRefresh) return null

  return (
    <div
      role="alert"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        backgroundColor: 'var(--color-surface)',
        borderBottom: '1px solid var(--color-border)',
        padding: '0.75rem 1rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: '0.875rem',
      }}
    >
      <span style={{ color: 'var(--color-text)' }}>Có phiên bản mới.</span>
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          onClick={() => updateServiceWorker(true)}
          style={{
            backgroundColor: 'var(--color-accent)',
            color: '#F5EDD6',
            border: 'none',
            padding: '0.375rem 0.75rem',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
        >
          Tải lại
        </button>
        <button
          onClick={() => setNeedRefresh(false)}
          style={{
            background: 'none',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-muted)',
            padding: '0.375rem 0.5rem',
            borderRadius: '0.25rem',
            cursor: 'pointer',
          }}
        >
          ✕
        </button>
      </div>
    </div>
  )
}
```

Add `<SwUpdateBanner />` to `App.tsx` at the top of `AppShell` (before `<main>`).

### TypeScript Declaration for Virtual Module

Add to `apps/reader/src/vite-env.d.ts` (or create if missing):
```typescript
/// <reference types="vite-plugin-pwa/client" />
```

This provides types for `virtual:pwa-register/react`.

### PWA Icon Creation

For MVP, create simple placeholder icons using an online tool (e.g., favicon.io, realfavicongenerator.net) or a simple script:
- 192×192: SVG circle with "M" letter or lotus symbol in vàng đất (#C8883A) on kem (#F5EDD6)
- 512×512: Same design at larger resolution
- Maskable: Add 10% padding on all sides (content in center 80%) to ensure it looks good in all clip shapes

If the team has design assets, use those. If not, simple geometric placeholder icons are acceptable for MVP.

### Project Structure Notes

Files created/modified in this story:
- `apps/reader/vite.config.ts` — MODIFIED (expand VitePWA config)
- `apps/reader/public/icons/icon-192x192.png` — NEW
- `apps/reader/public/icons/icon-512x512.png` — NEW
- `apps/reader/public/icons/icon-192x192-maskable.png` — NEW
- `apps/reader/public/favicon.ico` — NEW
- `apps/reader/public/offline.html` — NEW
- `apps/reader/public/_headers` — NEW
- `apps/reader/src/shared/components/SwUpdateBanner.tsx` — NEW
- `apps/reader/src/App.tsx` — MODIFIED (add SwUpdateBanner)
- `apps/reader/src/vite-env.d.ts` — MODIFIED (add pwa reference)

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 1.4]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Infrastructure & Deployment]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Gap Analysis — Gap 1 Base URL]
- [vite-plugin-pwa docs](https://vite-pwa-org.netlify.app/guide/)
- [Workbox generateSW configuration](https://developer.chrome.com/docs/workbox/reference/workbox-build/#type-GenerateSWConfig)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
