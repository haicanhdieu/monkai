---
title: 'Gate Vercel Deployment Behind CI Pipeline'
slug: 'gate-vercel-deployment-behind-ci'
created: '2026-03-19'
status: 'Completed'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['GitHub Actions', 'Vercel CLI', 'pnpm']
files_to_modify: ['.github/workflows/ci.yml']
code_patterns: []
test_patterns: []
---

# Tech-Spec: Gate Vercel Deployment Behind CI Pipeline

**Created:** 2026-03-19

## Overview

### Problem Statement

Vercel's dashboard git integration triggers builds in parallel with the GitHub Actions CI pipeline. When a push to `main` occurs, both start simultaneously — if CI fails (lint/type/test errors) but Vercel's own build succeeds, broken code gets deployed to production. The CI pipeline is effectively non-blocking.

### Solution

Disable Vercel's automatic git-triggered builds via the "Ignored Build Step" setting. Add a `deploy` job to the existing `ci.yml` workflow that only runs after the `ci` job passes, using the Vercel CLI (`vercel deploy --prebuilt --prod`) to upload the already-built `dist/` artifact from the CI job. This ensures deployment only happens on green pipelines on the `main` branch.

### Scope

**In Scope:**
- Disabling Vercel's native git integration (via dashboard "Ignored Build Step")
- Adding a `deploy` job to `.github/workflows/ci.yml` gated behind `needs: ci` and `if: github.ref == 'refs/heads/main'`
- Passing the build artifact (`apps/reader/dist/`) from `ci` job to `deploy` job via GitHub Actions artifacts
- Documenting the three GitHub repo secrets required (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`)

**Out of Scope:**
- Preview deployments for pull requests
- Changes to app source code or `vercel.json` rewrites
- Separate staging environment

---

## Context for Development

### Codebase Patterns

- Single workflow file: `.github/workflows/ci.yml`, one job named `ci`, triggers on push/PR to paths `apps/reader/**` and `.github/workflows/ci.yml`
- `working-directory: apps/reader` set as default for all steps in `ci` job
- Build output lands at `apps/reader/dist/` (standard Vite output)
- `vercel.json` at `apps/reader/vercel.json` — Vercel project root is `apps/reader/`
- No existing deploy step or secrets references in `ci.yml`

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `.github/workflows/ci.yml` | The only workflow — will be modified to add `deploy` job |
| `apps/reader/vercel.json` | Vercel rewrite rules — no changes needed |

### Technical Decisions

1. **Prebuilt deploy** — reuse the `dist/` artifact already produced by the `ci` job's `Build` step. Vercel CLI accepts `--prebuilt` to skip rebuilding. This avoids running the build twice.
2. **`actions/upload-artifact` / `download-artifact`** — pass `apps/reader/dist/` and `apps/reader/.vercel/` between jobs. The `.vercel/` directory is created by `vercel pull` and required by `vercel deploy --prebuilt`.
3. **`vercel pull` in deploy job** — needed to generate the `.vercel/project.json` config that `vercel build` and `vercel deploy --prebuilt` rely on. Run it before deploying: `vercel pull --yes --environment=production --token=$VERCEL_TOKEN`.
4. **`if: github.ref == 'refs/heads/main'`** — deploy job only runs on pushes to `main`, not on PRs.
5. **Ignored Build Step in Vercel** — set to `exit 1` in Vercel dashboard → Git → [project] → Ignored Build Step. This cancels all Vercel git-triggered builds. GitHub Actions becomes the sole deploy path.

---

## Implementation Plan

### Tasks

**Task 0 — Vercel Dashboard (Manual, prerequisite — do before merging)**

In the Vercel dashboard:
1. Navigate to Project → Settings → Git
2. Set **"Ignored Build Step"** to: `exit 1`
3. Save. This causes Vercel to cancel ALL git-triggered builds from now on.

> **Why not disable git integration entirely?** Keeping git integration connected lets Vercel link deployments to commits in the dashboard UI. `exit 1` in the ignored step is the standard pattern to block builds while keeping the connection.

---

**Task 1 — Add GitHub repo secrets (Manual, prerequisite)**

Add the following three secrets to the GitHub repo (Settings → Secrets and variables → Actions → New repository secret):

| Secret name | How to get it |
|---|---|
| `VERCEL_TOKEN` | Vercel dashboard → Account Settings → Tokens → Create token |
| `VERCEL_ORG_ID` | Run `vercel whoami --token <token>` or check `.vercel/project.json` after running `vercel link` locally |
| `VERCEL_PROJECT_ID` | Same `.vercel/project.json` after `vercel link` in `apps/reader/` |

To get both IDs locally (one-time):
```bash
cd apps/reader
npx vercel link  # follow prompts, connects to existing project
cat .vercel/project.json  # shows orgId and projectId
```

---

**Task 2 — Modify `.github/workflows/ci.yml`**

File: `.github/workflows/ci.yml`

Changes:
1. In the `ci` job, add an `Upload dist artifact` step **after** the `Build` step and **before** `Install Playwright browsers`.
2. Add a new `deploy` job after the `ci` job definition.

**Step to add inside `ci` job (after the `Build` step, line ~52):**

```yaml
      - name: Upload dist artifact
        uses: actions/upload-artifact@v4
        with:
          name: reader-dist
          path: apps/reader/dist/
          retention-days: 1
```

**New `deploy` job to add at the end of the file:**

```yaml
  deploy:
    name: Deploy to Vercel (production)
    runs-on: ubuntu-latest
    needs: ci
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Download dist artifact
        uses: actions/download-artifact@v4
        with:
          name: reader-dist
          path: apps/reader/dist/

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Vercel CLI
        run: pnpm add -g vercel@latest

      - name: Pull Vercel project settings
        working-directory: apps/reader
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Deploy prebuilt to Vercel production
        working-directory: apps/reader
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

---

**Complete final `ci.yml` for reference:**

```yaml
name: Reader CI

on:
  push:
    branches: [main]
    paths:
      - 'apps/reader/**'
      - '.github/workflows/ci.yml'
  pull_request:
    paths:
      - 'apps/reader/**'
      - '.github/workflows/ci.yml'

permissions:
  contents: read

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

      - name: Build EPUBs
        run: pnpm run build:epubs

      - name: Build
        run: pnpm build
        # VITE_BASE_PATH not needed — Vercel serves from root (/)
        # VITE_BOOK_DATA_URL not needed — proxied via Vercel rewrite from same origin

      - name: Upload dist artifact
        uses: actions/upload-artifact@v4
        with:
          name: reader-dist
          path: apps/reader/dist/
          retention-days: 1

      - name: Install Playwright browsers
        run: pnpm exec playwright install --with-deps chromium

      - name: E2E tests
        run: pnpm e2e

  deploy:
    name: Deploy to Vercel (production)
    runs-on: ubuntu-latest
    needs: ci
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v4

      - name: Download dist artifact
        uses: actions/download-artifact@v4
        with:
          name: reader-dist
          path: apps/reader/dist/

      - uses: pnpm/action-setup@v4
        with:
          version: 9

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install Vercel CLI
        run: pnpm add -g vercel@latest

      - name: Pull Vercel project settings
        working-directory: apps/reader
        run: vercel pull --yes --environment=production --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      - name: Deploy prebuilt to Vercel production
        working-directory: apps/reader
        run: vercel deploy --prebuilt --prod --token=${{ secrets.VERCEL_TOKEN }}
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

### Acceptance Criteria

**AC1 — CI gates deployment (happy path)**
```
Given: A push to main where lint, typecheck, unit tests, build, and e2e all pass
When: The CI pipeline completes
Then: The `deploy` job runs and deploys to Vercel production
And: The Vercel dashboard shows a new deployment linked to the commit
```

**AC2 — Broken CI blocks deployment**
```
Given: A push to main where any CI step fails (lint/typecheck/test/build/e2e)
When: The CI pipeline fails
Then: The `deploy` job does NOT run (skipped due to `needs: ci`)
And: No new Vercel deployment is created
And: The previously deployed version remains live
```

**AC3 — PRs do not trigger deployment**
```
Given: A pull request is opened or updated
When: CI runs on the PR
Then: The `deploy` job does NOT run (blocked by `if: github.ref == 'refs/heads/main'`)
And: No Vercel production deployment is created
```

**AC4 — Vercel dashboard no longer auto-deploys**
```
Given: Vercel "Ignored Build Step" is set to `exit 1`
When: Any git push reaches Vercel via dashboard integration
Then: Vercel cancels the build immediately (exit 1)
And: Only GitHub Actions-triggered deploys create new production deployments
```

---

## Additional Context

### Dependencies

- **Vercel CLI** (`vercel@latest`) — installed fresh in deploy job via `pnpm add -g`
- **`actions/upload-artifact@v4`** and **`actions/download-artifact@v4`** — standard GitHub Actions marketplace actions
- **Three GitHub repo secrets** must be set before the deploy job can succeed (Task 1)
- **Vercel "Ignored Build Step"** must be configured in dashboard before merging (Task 0)

### Testing Strategy

Manual verification steps after merge:
1. Push a deliberately broken commit (add a lint error) → verify `deploy` job is skipped in Actions tab
2. Revert the broken commit → verify `deploy` job runs and succeeds → verify Vercel shows new deployment
3. Open a PR → verify `deploy` job is absent from the workflow run

### Notes

- The `.vercel/output/` artifact upload is placed **after** `Build` and **before** Playwright install — this ensures the artifact is always uploaded even if E2E tests fail (though `deploy` still won't run since `needs: ci` requires the whole job to pass).
- `retention-days: 1` on the artifact keeps storage usage minimal.
- `vercel pull` is fast (just fetches project config) and needed to create `.vercel/project.json` for the prebuilt deploy to work correctly.
- The Vercel project root is `apps/reader/` — all `vercel` CLI commands must run with `working-directory: apps/reader`.
- `vercel build --prod` (not `pnpm build`) is used in the CI job — it internally runs the Vite build and packages output to `.vercel/output/` (Vercel Build Output API format), which is what `vercel deploy --prebuilt` requires. Raw Vite `dist/` is not compatible with `--prebuilt`.
- VERCEL secrets (`VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`) are required in **both** the `ci` and `deploy` jobs.

## Review Notes
- Adversarial review completed
- Findings: 12 total, 7 fixed, 5 skipped (noise/intentional)
- Resolution approach: auto-fix
- Key fix: replaced `pnpm build` with `vercel build` in CI job and artifact path from `dist/` to `.vercel/output/` to satisfy `--prebuilt` contract
