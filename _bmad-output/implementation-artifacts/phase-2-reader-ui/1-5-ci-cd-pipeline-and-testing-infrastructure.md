# Story 1.5: CI/CD Pipeline & Testing Infrastructure

Status: done

## Story

As a **developer**,
I want automated quality gates running on every push to `main`,
So that regressions are caught automatically and the app deploys to GitHub Pages without manual intervention.

## Acceptance Criteria

1. **Given** `.github/workflows/ci.yml` with path filter `apps/reader/**`
   **When** code is pushed to `main` with changes in `apps/reader/`
   **Then** the pipeline runs in sequence: ESLint → `tsc --noEmit` → Vitest → `vite build` → Playwright E2E → GitHub Pages deploy; any step failure halts the pipeline

2. **Given** `vitest.config.ts` with jsdom environment and `@testing-library/react`
   **When** `pnpm test` runs
   **Then** it discovers co-located `*.test.ts` and `*.test.tsx` files and exits 0, including the WCAG contrast test from Story 1.2

3. **Given** `playwright.config.ts` running against built `dist/` via `vite preview`
   **When** `pnpm e2e` runs
   **Then** a smoke test passes: app shell loads, all 4 bottom nav tabs are visible, navigating between tabs works without errors

4. **Given** a commit introducing a direct `localStorage` import
   **When** the CI lint step runs
   **Then** the pipeline fails at lint with a clear ESLint error, and deployment is skipped

## Tasks / Subtasks

- [ ] Task 1: Create `vitest.config.ts` (AC: #2)
  - [ ] Subtask 1.1: Create `apps/reader/vitest.config.ts`
  - [ ] Subtask 1.2: Set `environment: 'jsdom'` for DOM testing
  - [ ] Subtask 1.3: Configure `include: ['src/**/*.test.{ts,tsx}']` — co-located test pattern
  - [ ] Subtask 1.4: Set up `setupFiles` to import `@testing-library/jest-dom` for extended matchers
  - [ ] Subtask 1.5: Configure `globals: true` so `describe/it/expect` work without imports in test files
  - [ ] Subtask 1.6: Add coverage config: `provider: 'v8'`, `reporter: ['text', 'lcov']`

- [ ] Task 2: Configure `package.json` test scripts (AC: #2, #3)
  - [ ] Subtask 2.1: Set `"test": "vitest run"` (single run, not watch — for CI)
  - [ ] Subtask 2.2: Set `"test:watch": "vitest"` (watch mode for development)
  - [ ] Subtask 2.3: Set `"test:coverage": "vitest run --coverage"`
  - [ ] Subtask 2.4: Set `"e2e": "playwright test"`
  - [ ] Subtask 2.5: Set `"e2e:ui": "playwright test --ui"` (for local debugging)
  - [ ] Subtask 2.6: Set `"lint": "eslint src --ext .ts,.tsx --report-unused-disable-directives --max-warnings 0"`
  - [ ] Subtask 2.7: Set `"typecheck": "tsc --noEmit"`
  - [ ] Subtask 2.8: Set `"preview": "vite preview"` (for Playwright to run against)

- [ ] Task 3: Create `playwright.config.ts` (AC: #3)
  - [ ] Subtask 3.1: Create `apps/reader/playwright.config.ts`
  - [ ] Subtask 3.2: Set `testDir: './e2e'`
  - [ ] Subtask 3.3: Configure `webServer` to start `pnpm preview --port 4173` before tests
  - [ ] Subtask 3.4: Set `baseURL: 'http://localhost:4173'`
  - [ ] Subtask 3.5: Configure browser projects: chromium (mobile viewport: 390×844, iPhone 14 config)
  - [ ] Subtask 3.6: Set `reporter: [['html', { open: 'never' }]]` for CI compatibility
  - [ ] Subtask 3.7: Set `use: { screenshot: 'only-on-failure', video: 'retain-on-failure' }`

- [ ] Task 4: Create E2E smoke test (AC: #3)
  - [ ] Subtask 4.1: Create `apps/reader/e2e/` directory
  - [ ] Subtask 4.2: Create `apps/reader/e2e/app-shell.spec.ts`
  - [ ] Subtask 4.3: Test 1: App shell loads — navigate to `/`, verify page title contains "Monkai"
  - [ ] Subtask 4.4: Test 2: All 4 bottom nav tabs visible — query for tab labels in Vietnamese ("Trang Chủ", "Thư Viện", "Đánh Dấu", "Cài Đặt"), verify all 4 are visible
  - [ ] Subtask 4.5: Test 3: Tab navigation works — click "Thư Viện", verify URL includes `/library`, page content updates, no JS errors in console
  - [ ] Subtask 4.6: Test 4: Library to Category navigation — after navigating to library, click a category link if present (or use `page.goto('/library/nikaya')`) and verify the page renders

- [ ] Task 5: Create GitHub Actions CI/CD workflow (AC: #1, #4)
  - [ ] Subtask 5.1: Create `.github/workflows/ci.yml` at repo root (not inside apps/reader)
  - [ ] Subtask 5.2: Set trigger: `push` to `main`, path filter: `apps/reader/**`
  - [ ] Subtask 5.3: Configure `permissions: contents: write, pages: write, id-token: write` for GitHub Pages deployment
  - [ ] Subtask 5.4: Step 1 — Lint: `cd apps/reader && pnpm lint`
  - [ ] Subtask 5.5: Step 2 — Type check: `cd apps/reader && pnpm typecheck`
  - [ ] Subtask 5.6: Step 3 — Unit tests: `cd apps/reader && pnpm test`
  - [ ] Subtask 5.7: Step 4 — Build: `cd apps/reader && pnpm build`
  - [ ] Subtask 5.8: Step 5 — E2E tests: `cd apps/reader && pnpm e2e`
  - [ ] Subtask 5.9: Step 6 — Deploy: upload `apps/reader/dist/` to GitHub Pages using `actions/deploy-pages`
  - [ ] Subtask 5.10: Add pnpm setup with caching: use `pnpm/action-setup` + `actions/setup-node` with `cache: 'pnpm'`
  - [ ] Subtask 5.11: Add Playwright browsers install: `pnpm exec playwright install --with-deps chromium`

- [ ] Task 6: Verify full pipeline locally (AC: #1, #2, #3)
  - [ ] Subtask 6.1: Run `pnpm lint` — must exit 0 (no ESLint errors or warnings)
  - [ ] Subtask 6.2: Run `pnpm typecheck` — must exit 0 (no TypeScript errors)
  - [ ] Subtask 6.3: Run `pnpm test` — all tests pass including WCAG contrast test
  - [ ] Subtask 6.4: Run `pnpm build` — `dist/` produced successfully
  - [ ] Subtask 6.5: Run `pnpm e2e` — smoke test passes against built dist
  - [ ] Subtask 6.6: Test lint gate: temporarily add `const x = localStorage.getItem('test')` to any component, confirm `pnpm lint` fails with the ESLint error, then remove it

## Dev Notes

### vitest.config.ts

```typescript
// apps/reader/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'url'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/main.tsx'],
    },
  },
})
```

Create `apps/reader/src/test-setup.ts`:
```typescript
import '@testing-library/jest-dom'
```

Note: `@testing-library/jest-dom` must be installed: `pnpm add -D @testing-library/jest-dom`

### playwright.config.ts

```typescript
// apps/reader/playwright.config.ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:4173',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'mobile-chrome',
      use: {
        ...devices['iPhone 14'],
        // Override to use Chromium instead of Webkit for mobile sim
        browserName: 'chromium',
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: 'pnpm preview --port 4173',
    port: 4173,
    reuseExistingServer: !process.env.CI,
  },
})
```

### E2E Smoke Test

```typescript
// apps/reader/e2e/app-shell.spec.ts
import { test, expect } from '@playwright/test'

test.describe('App shell smoke test', () => {
  test('loads successfully', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveTitle(/Monkai/)
  })

  test('renders all 4 bottom nav tabs', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByText('Trang Chủ')).toBeVisible()
    await expect(page.getByText('Thư Viện')).toBeVisible()
    await expect(page.getByText('Đánh Dấu')).toBeVisible()
    await expect(page.getByText('Cài Đặt')).toBeVisible()
  })

  test('navigates between tabs without errors', async ({ page }) => {
    const consoleErrors: string[] = []
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text())
    })

    await page.goto('/')

    // Navigate to Library
    await page.getByText('Thư Viện').click()
    await expect(page).toHaveURL(/\/library/)
    expect(consoleErrors).toHaveLength(0)

    // Navigate to Bookmarks
    await page.getByText('Đánh Dấu').click()
    await expect(page).toHaveURL(/\/bookmarks/)
    expect(consoleErrors).toHaveLength(0)

    // Navigate to Settings
    await page.getByText('Cài Đặt').click()
    await expect(page).toHaveURL(/\/settings/)
    expect(consoleErrors).toHaveLength(0)

    // Navigate back to Home
    await page.getByText('Trang Chủ').click()
    await expect(page).toHaveURL('/')
    expect(consoleErrors).toHaveLength(0)
  })
})
```

### GitHub Actions Workflow

```yaml
# .github/workflows/ci.yml
name: Reader CI/CD

on:
  push:
    branches: [main]
    paths:
      - 'apps/reader/**'
      - '.github/workflows/ci.yml'

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: 'pages'
  cancel-in-progress: false

jobs:
  ci:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: apps/reader
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'
          cache-dependency-path: apps/reader/pnpm-lock.yaml

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm lint

      - name: Type check
        run: pnpm typecheck

      - name: Unit tests
        run: pnpm test

      - name: Build
        run: pnpm build
        env:
          VITE_BASE_PATH: /monkai/
          # VITE_BOOK_DATA_URL is intentionally empty — book-data served from same GitHub Pages origin

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium

      - name: E2E tests
        run: pnpm e2e

      - name: Upload build artifact
        uses: actions/upload-pages-artifact@v3
        with:
          path: apps/reader/dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: ci
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

### GitHub Pages Setup (One-Time Manual Step)

Before the CI workflow can deploy, you must enable GitHub Pages in the repo settings:
1. Go to Settings → Pages
2. Set Source to "GitHub Actions" (not "Deploy from branch")
3. This is a one-time setup — CI will handle all future deployments

### pnpm Workspace Consideration

If a `pnpm-workspace.yaml` is added at the repo root later, ensure `cache-dependency-path` in the CI workflow points to the correct lock file. For MVP with pnpm only in `apps/reader/`, the lock file is at `apps/reader/pnpm-lock.yaml`.

### Lint Gate Verification

The ESLint `no-restricted-globals` rule from Story 1.1 blocks `localStorage` usage. The CI lint step runs with `--max-warnings 0` so even warnings fail the build. This is the enforcement mechanism for AC #4.

### Project Structure Notes

Files created/modified in this story:
- `.github/workflows/ci.yml` — NEW (at repo root, not in apps/reader/)
- `apps/reader/vitest.config.ts` — NEW
- `apps/reader/src/test-setup.ts` — NEW
- `apps/reader/playwright.config.ts` — NEW
- `apps/reader/e2e/app-shell.spec.ts` — NEW
- `apps/reader/package.json` — MODIFIED (add test/e2e/lint/typecheck/preview scripts)

### pnpm Lock File

After running `pnpm install` in `apps/reader/`, commit `apps/reader/pnpm-lock.yaml` to the repo. The CI workflow uses `--frozen-lockfile` which requires this file to exist.

### References

- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/epics-reader-ui.md#Story 1.5]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Infrastructure & Deployment]
- [Source: _bmad-output/planning-artifacts/phase-2-reader-ui/architecture-reader-ui.md#Testing]
- [GitHub Actions deploy-pages action](https://github.com/actions/deploy-pages)
- [vite-plugin-pwa GitHub Pages guide](https://vite-pwa-org.netlify.app/deployment/github-pages.html)

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
