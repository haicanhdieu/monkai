# Story 1.1: Monorepo Setup & App Scaffold

Status: done

## Story

As a **developer**,
I want the monorepo structure established and the React PWA app scaffolded with all dependencies,
So that the team has a consistent, working development environment to build upon.

## Acceptance Criteria

1. **Given** the monorepo layout from Epic 0 (`apps/crawler/` exists, `devbox.json` updated)
   **When** the developer scaffolds the reader app
   **Then** `apps/reader/` is created via `npm create @vite-pwa/pwa@latest` (react-ts template)

2. **When** all dependencies are installed
   **Then** `package.json` pins exactly: `tailwindcss@^3.4.x`, `react-router-dom`, `zustand`, `@tanstack/react-query`, `localforage`, `zod`, `minisearch`, `@radix-ui/react-slider`, `@radix-ui/react-dialog`, `vitest`, `@testing-library/react`, `playwright`, `concurrently`

3. **Given** the `devbox.json` placeholder scripts from Epic 0 (dev, build, test echo placeholders)
   **When** updated for the real reader app
   **Then**:
   - `devbox run dev` → `cd apps/reader && pnpm dev` (which runs mock server + Vite via concurrently)
   - `devbox run build` → `cd apps/reader && pnpm build`
   - `devbox run test` → `cd apps/reader && pnpm test`

4. **Given** `apps/reader/scripts/mock-server.mjs` using Node built-in `http`
   **When** the developer runs `node scripts/mock-server.mjs`
   **Then** the server serves files from `../../book-data/` on `http://localhost:3001` with CORS headers for `http://localhost:5173`

5. **Given** `.env.development` sets `VITE_BOOK_DATA_URL=http://localhost:3001` and `.env` sets `VITE_BASE_PATH=/`
   **When** the Vite dev server starts
   **Then** requests to `/book-data/*` are proxied to `http://localhost:3001`

6. **Given** `tsconfig.json` and `vite.config.ts`
   **When** a developer imports using `@/`
   **Then** the alias resolves to `apps/reader/src/`

7. **Given** `.eslintrc.cjs` with `no-restricted-imports` rule
   **When** any source file imports `localStorage` or `indexedDB` directly
   **Then** ESLint reports an error

## Tasks / Subtasks

- [ ] Task 1: Scaffold `apps/reader/` with vite-pwa (AC: #1, #2)
  - [ ] Subtask 1.1: From repo root, run `cd apps && npm create @vite-pwa/pwa@latest reader -- --template react-ts` (or interactive wizard selecting react-ts)
  - [ ] Subtask 1.2: Verify React version — if React 19 is scaffolded, pin React 18 in package.json (`"react": "^18.3.0"`, `"react-dom": "^18.3.0"`)
  - [ ] Subtask 1.3: Inside `apps/reader/`, install all required deps with pnpm: `pnpm add tailwindcss@^3.4 autoprefixer postcss react-router-dom zustand @tanstack/react-query localforage zod minisearch @radix-ui/react-slider @radix-ui/react-dialog`
  - [ ] Subtask 1.4: Install dev deps: `pnpm add -D vitest @testing-library/react @testing-library/user-event @vitejs/plugin-react jsdom playwright concurrently @playwright/test`
  - [ ] Subtask 1.5: Verify all deps appear in `apps/reader/package.json`

- [ ] Task 2: Create mock server script (AC: #4)
  - [ ] Subtask 2.1: Create `apps/reader/scripts/mock-server.mjs` using Node `http` module (no dependencies)
  - [ ] Subtask 2.2: Server reads files from `../../book-data/` relative to script location
  - [ ] Subtask 2.3: Respond with `Content-Type: application/json` and CORS headers (`Access-Control-Allow-Origin: http://localhost:5173`)
  - [ ] Subtask 2.4: Listen on port 3001; log `Mock server running on http://localhost:3001` on start

- [ ] Task 3: Configure env files (AC: #5)
  - [ ] Subtask 3.1: Create `apps/reader/.env` with `VITE_BASE_PATH=/`
  - [ ] Subtask 3.2: Create `apps/reader/.env.development` with `VITE_BOOK_DATA_URL=http://localhost:3001` and `VITE_BASE_PATH=/`
  - [ ] Subtask 3.3: Create `apps/reader/.env.production` with `VITE_BASE_PATH=/monkai/` and `VITE_BOOK_DATA_URL=` (empty — served from same origin)
  - [ ] Subtask 3.4: Add `.env*.local` to `apps/reader/.gitignore`

- [ ] Task 4: Configure TypeScript `@/` alias (AC: #6)
  - [ ] Subtask 4.1: In `apps/reader/tsconfig.json`, set `"paths": { "@/*": ["./src/*"] }` under `compilerOptions`
  - [ ] Subtask 4.2: In `apps/reader/vite.config.ts`, add `resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } }` using `import { fileURLToPath } from 'url'`
  - [ ] Subtask 4.3: Verify `import { foo } from '@/shared/constants/routes'` resolves without TS errors

- [ ] Task 5: Configure `vite.config.ts` with proxy and PWA plugin (AC: #5)
  - [ ] Subtask 5.1: Add `server.proxy` rule: when `VITE_BOOK_DATA_URL` is set, proxy `/book-data` to that URL
  - [ ] Subtask 5.2: Ensure `vite-plugin-pwa` is configured (from scaffolder — may already be present)
  - [ ] Subtask 5.3: Set `base: process.env.VITE_BASE_PATH ?? '/'` in vite config

- [ ] Task 6: Configure ESLint no-restricted-imports (AC: #7)
  - [ ] Subtask 6.1: Create or update `apps/reader/.eslintrc.cjs`
  - [ ] Subtask 6.2: Add `no-restricted-imports` rule to block `localStorage` and `indexedDB` global usage with message: "Use StorageService instead of localStorage/indexedDB directly"
  - [ ] Subtask 6.3: Run `pnpm lint` and verify no false positives on scaffold code

- [ ] Task 7: Update `devbox.json` at repo root (AC: #3)
  - [ ] Subtask 7.1: Replace `dev` placeholder with `cd apps/reader && pnpm dev`
  - [ ] Subtask 7.2: Replace `build` placeholder with `cd apps/reader && pnpm build`
  - [ ] Subtask 7.3: Replace `test` placeholder (or add new) with `cd apps/reader && pnpm test`
  - [ ] Subtask 7.4: Update `apps/reader/package.json` `"dev"` script to: `concurrently "node scripts/mock-server.mjs" "vite"`
  - [ ] Subtask 7.5: Verify `devbox run dev` starts both mock server and Vite

- [ ] Task 8: Create initial src directory structure (AC: #6)
  - [ ] Subtask 8.1: Create `apps/reader/src/features/` with subdirectories: `home/`, `reader/`, `library/`, `bookmarks/`, `settings/`
  - [ ] Subtask 8.2: Create `apps/reader/src/shared/` with subdirectories: `components/`, `hooks/`, `services/`, `schemas/`, `constants/`, `types/`
  - [ ] Subtask 8.3: Create `apps/reader/src/stores/` directory
  - [ ] Subtask 8.4: Create `apps/reader/src/lib/pagination/` directory
  - [ ] Subtask 8.5: Place a minimal `App.tsx` that renders `<div>Monkai Reader</div>` and a working `main.tsx` entry point

- [ ] Task 9: Verify scaffold works end-to-end
  - [ ] Subtask 9.1: Run `pnpm build` — confirm `apps/reader/dist/` is produced with no errors
  - [ ] Subtask 9.2: Run `pnpm lint` — confirm 0 errors on scaffold
  - [ ] Subtask 9.3: Run `pnpm test` — confirm test runner launches (may have 0 tests — that is OK)

## Dev Notes

### Critical: Scaffolding Command & Version Check

Use the official PWA scaffolder — it correctly pre-configures vite-plugin-pwa and Workbox:

```bash
cd apps
npm create @vite-pwa/pwa@latest
# Select: react-ts template in wizard
# OR use flag: -- --template react-ts
```

**⚠️ React Version Check (Critical):** `@vite-pwa/create-pwa` v1.0.0+ targets Vite 7 and may scaffold React 19. Check the scaffolded `package.json`:
- If React 19 → downgrade to `^18.3.0` for team compatibility
- Vite 7 is fine and expected
- vite-plugin-pwa version from scaffolder should be accepted as-is

**⚠️ Tailwind Version (Critical):** The project pins **Tailwind v3** (`tailwindcss@^3.4.x`). Do NOT let npm/pnpm install Tailwind v4 — v4 uses a CSS-first config that breaks `tailwind.config.ts` format. Always install with explicit version constraint: `pnpm add tailwindcss@^3.4`.

### Package Manager

Use **pnpm** for `apps/reader/` (aligns with monorepo tooling):
```bash
cd apps/reader
pnpm add [deps]
```

Do NOT mix npm/yarn/pnpm installs in the same directory.

### Mock Server Implementation

The mock server must use ONLY Node.js built-in modules — no external packages:

```javascript
// apps/reader/scripts/mock-server.mjs
import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOOK_DATA_DIR = path.resolve(__dirname, '../../book-data')
const PORT = 3001

const server = http.createServer((req, res) => {
  // Strip /book-data prefix if present
  const urlPath = req.url.replace(/^\/book-data/, '') || '/index.json'
  const filePath = path.join(BOOK_DATA_DIR, urlPath)

  res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
  res.setHeader('Access-Control-Allow-Methods', 'GET')

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Not found' }))
      return
    }
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(data)
  })
})

server.listen(PORT, () => {
  console.log(`Mock server running on http://localhost:${PORT}`)
  console.log(`Serving book-data from: ${BOOK_DATA_DIR}`)
})
```

### vite.config.ts Key Configuration

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
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
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
        // Full PWA config added in Story 1.4
      }),
    ],
  }
})
```

### ESLint Configuration

```javascript
// apps/reader/.eslintrc.cjs
module.exports = {
  // ... other config from scaffolder
  rules: {
    'no-restricted-globals': [
      'error',
      { name: 'localStorage', message: 'Use StorageService instead of localStorage directly.' },
      { name: 'indexedDB', message: 'Use StorageService instead of indexedDB directly.' },
    ],
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['localforage'],
            message: 'Import StorageService from @/shared/services/storage.service instead.',
          },
        ],
        // Allow localforage only inside shared/services/
      },
    ],
  },
}
```

Note: `no-restricted-globals` blocks `window.localStorage` references; `no-restricted-imports` blocks direct localforage imports in non-service files.

### Project Structure Notes

After this story, the repo root should look like:

```
monkai/
├── apps/
│   ├── crawler/          ← from Epic 0 (done)
│   └── reader/           ← NEW: scaffolded in this story
│       ├── scripts/
│       │   └── mock-server.mjs
│       ├── src/
│       │   ├── features/
│       │   ├── shared/
│       │   ├── stores/
│       │   ├── lib/
│       │   ├── App.tsx
│       │   └── main.tsx
│       ├── .env
│       ├── .env.development
│       ├── .env.production
│       ├── vite.config.ts
│       ├── tsconfig.json
│       ├── .eslintrc.cjs
│       └── package.json
├── devbox.json           ← updated with real reader commands
└── ...
```

### devbox.json Final State

```json
{
  "scripts": {
    "crawl": "cd apps/crawler && uv run python crawler.py",
    "dev": "cd apps/reader && pnpm dev",
    "build": "cd apps/reader && pnpm build",
    "test": "cd apps/reader && pnpm test",
    "test:crawler": "cd apps/crawler && uv run pytest",
    "lint": "cd apps/reader && pnpm lint",
    "build-books": "cd apps/crawler && uv run python book_builder.py",
    "pipeline": "cd apps/crawler && uv run python pipeline.py"
  }
}
```

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 1.1]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Starter Template Evaluation]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Monorepo Organization]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Gap Analysis — Gap 1 Base URL + Data Source]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Gap Analysis — Gap 2 Tailwind version]
- [Source: _bmad-output/implementation-artifacts/phase-2-reader-ui/0-1-migrate-crawler-to-apps-crawler-and-establish-monorepo-layout.md]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
