---
title: 'Deploy book-data to Vercel Blob and reader as static web'
slug: 'deploy-book-data-vercel-blob-reader-static'
created: '2026-03-14'
status: 'Implementation Complete'
stepsCompleted: [1, 2, 3, 4, 5, 6]
tech_stack: ['Node.js (ESM)', 'Vercel CLI', '@vercel/blob SDK', 'pnpm']
files_to_modify: ['devbox.json', 'README.md', '_bmad-output/project-context.md']
files_to_create: ['apps/deployer/package.json', 'apps/deployer/scripts/upload-book-data-to-blob.mjs', 'apps/deployer/scripts/deploy-reader-static.mjs', 'apps/deployer/README.md', 'apps/deployer/.env.example']
code_patterns: ['ESM scripts (.mjs) in apps/reader/scripts', 'Config via env (BOOK_DATA_SRC, BLOB_READ_WRITE_TOKEN)', 'Crawler output_dir from config.yaml']
test_patterns: ['Manual verification; optional dry-run in upload script']
---

# Tech-Spec: Deploy book-data to Vercel Blob and reader as static web

**Created:** 2026-03-14

## Overview

### Problem Statement

Source code must not be public (no public GitHub). The reader app and book-data still need to be deployed. Book-data (crawler output: JSON + images) should be hosted on Vercel Blob; the reader app should be deployed as a static web app (e.g. via Vercel CLI without Git linking).

### Solution

Add `apps/deployer` with scripts that: (1) upload the book-data tree from crawler output to a **Vercel Blob** store (public), using pathnames prefixed with `book-data/` so the reader's existing `VITE_BOOK_DATA_URL` points at the Blob store root; (2) build and deploy the **reader** as a static site (e.g. Vercel CLI from local, no Git) so the full stack runs without exposing source on public GitHub.

### Scope

**In Scope:**
- Scripts under `apps/deployer` to upload book-data to Vercel Blob (walk crawler `data/book-data/`, put each file with pathname `book-data/<relative path>`).
- Script(s) to build the reader and deploy it as static (e.g. Vercel CLI) from local/CI without Git link.
- **Devbox:** Deployment commands runnable from repo root via `devbox run deploy:book-data`, `devbox run deploy:reader`, `devbox run deploy:all`.
- Configurable source path for book-data (default: `apps/crawler/data/book-data/`).
- **Deployer README** and env/token usage (e.g. `BLOB_READ_WRITE_TOKEN`, `VITE_BOOK_DATA_URL` for reader build), including devbox usage.
- **Related docs:** Update root README and project-context to mention deployer and deployment flow.
- Document how to set reader's `VITE_BOOK_DATA_URL` to the Blob store URL after first upload.

**Out of Scope:**
- Changing crawler or reader app logic beyond build env (e.g. `VITE_BOOK_DATA_URL`).
- Deploying EPUBs to Blob in this spec (can be added later).
- Git-based or GitHub-linked deployments; keeping repo private is a constraint, not a code change.

## Context for Development

### Codebase Patterns

- **Monorepo:** Apps under `apps/`; crawler is Python (output_dir in config.yaml), reader is React/Vite (pnpm). Deployer is new; use Node ESM (`.mjs`) to match reader scripts and to use `@vercel/blob` from Node.
- **Book-data layout:** Crawler writes to `{output_dir}/book-data/` (default `apps/crawler/data/book-data/`). Contains `index.json` at root and `vbeta/{cat}/{book_seo}/book.json` plus sibling `images/` (cover.jpg, etc.). Paths in index.json are relative to book-data root (e.g. `vbeta/kinh/bo-trung-quan/book.json`).
- **Reader URL construction:** `data.service.ts` uses `resolveBookDataBaseUrl()` and fetches `base + '/book-data/' + path`. So Blob pathnames must be `book-data/index.json`, `book-data/vbeta/...` so that `VITE_BOOK_DATA_URL` = Blob store root (no trailing slash) yields correct URLs.
- **Reader build:** `pnpm build` in apps/reader runs `tsc -b && vite build`; optional `build:epubs` runs before build in CI. For Blob-backed deploy, build with `VITE_BOOK_DATA_URL=<blob-store-root>` so no local book-data copy is needed.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/crawler/config.yaml` | output_dir (default `data`) → book-data at `apps/crawler/data/book-data/` |
| `apps/crawler/indexer.py` | Builds index.json; scan pattern and path semantics |
| `apps/reader/src/shared/services/data.service.ts` | resolveBookDataBaseUrl(), fetch paths `/book-data/...` |
| `apps/reader/package.json` | build + build:epubs scripts; no Vercel deps today |
| `apps/reader/scripts/build-epubs.mjs` | Pattern for ESM script with path resolution from script dir |
| `devbox.json` | Root shell scripts; add deploy:book-data, deploy:reader, deploy:all (require Node/pnpm for deployer) |

### Technical Decisions

- **Vercel Blob**: Public store so reader can fetch catalog and book JSON/images without auth. Use SDK `@vercel/blob` `put()` with pathname `book-data/<rel>`, store root URL = `VITE_BOOK_DATA_URL`. **CORS:** Vercel Blob public store URLs are served with permissive CORS for browser fetches; if the reader origin is blocked, configure CORS for the Blob store per Vercel Blob docs.
- **Reader static**: Build in `apps/reader` (pnpm build), then deploy via Vercel CLI so no Git link required.

## Implementation Plan

### Tasks

- [x] Task 1: Create `apps/deployer` package
  - File: `apps/deployer/package.json`
  - Action: Add `package.json` with `"type": "module"`, name `deployer`, and scripts: `upload:book-data`, `deploy:reader`, and optionally `deploy:all`. Add dependency `@vercel/blob` and devDependency `vercel` (CLI). No TypeScript; use `.mjs` scripts.

- [x] Task 2: Implement book-data upload script
  - File: `apps/deployer/scripts/upload-book-data-to-blob.mjs`
  - Action: Source directory from env `BOOK_DATA_SRC` or, if unset, default to `path.join(repoRoot, 'apps/crawler/data/book-data')` where repo root is derived from script location: `path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')` (so it works whether run from repo root or from `apps/deployer`). Walk the source tree; for each file, pathname = `book-data/` + path relative to source root (forward slashes). Use `@vercel/blob` `put(pathname, body, { access: 'public', allowOverwrite: true, contentType })` with contentType set per extension (e.g. `application/json` for `.json`, `image/jpeg` for `.jpg`, `image/png` for `.png`). Token from `process.env.BLOB_READ_WRITE_TOKEN`; exit non-zero if token missing. On first upload failure, exit immediately (fail-fast); do not continue uploading. Support `--dry-run` (log pathnames only). After first successful upload, print Blob store root URL (from put() return; document in README as value for `VITE_BOOK_DATA_URL`).
  - Notes: Body via `fs.readFileSync` or createReadStream for large files; log progress (e.g. every N files). Scripts read `process.env`; for `.env` support, document in README that users export variables or add optional dotenv load at script start for `apps/deployer/.env`.

- [x] Task 3: Implement reader deploy script
  - File: `apps/deployer/scripts/deploy-reader-static.mjs`
  - Action: Require env `VITE_BOOK_DATA_URL`. Run `cd apps/reader && npx vercel deploy --prod --build-env VITE_BOOK_DATA_URL=$VITE_BOOK_DATA_URL --yes` (or equivalent from repo root with --cwd). If the reader is deployed under a path (e.g. `/monkai/`), set `VITE_BASE_PATH` via `--build-env` (e.g. `VITE_BASE_PATH=/` for Vercel default root). Output deployment URL on success.
  - Notes: Ensure `apps/reader/.vercel` is in reader's `.gitignore` if not already. Vercel CLI must be authenticated: `vercel login` (interactive) or `VERCEL_TOKEN` for non-interactive/CI; document in README. Alternative: build locally then deploy dist; prefer Vercel-side build for simplicity.

- [x] Task 4: Create deployer README and env example
  - File: `apps/deployer/README.md`, `apps/deployer/.env.example`
  - Action: README: Purpose (Blob + static reader, no public Git); Prerequisites (Node 18+, pnpm, Vercel, Devbox); One-time: create one Vercel Blob store (e.g. name `book-data`), get `BLOB_READ_WRITE_TOKEN` for that store (token is scoped to the store); set env via `export BLOB_READ_WRITE_TOKEN=...` or create `apps/deployer/.env` (if scripts load it, e.g. with dotenv). Vercel CLI auth: `vercel login` or set `VERCEL_TOKEN` for CI. Devbox commands from repo root (`devbox run deploy:book-data`, `deploy:reader`, `deploy:all`). **First-time deploy:** run `deploy:book-data`, set `VITE_BOOK_DATA_URL` to the printed Blob store root URL, then run `deploy:reader` (or `deploy:all` only after URL is set). Without devbox: `cd apps/deployer && pnpm run ...` with env set. Optional `BOOK_DATA_SRC`. One-time `pnpm install` in apps/deployer. .env.example: `BLOB_READ_WRITE_TOKEN=`, `BOOK_DATA_SRC=`, `VITE_BOOK_DATA_URL=`, `VERCEL_TOKEN=` (optional).
  - Notes: README linked from root README Deployment section.

- [x] Task 5: Add Devbox deployment commands
  - File: `devbox.json`
  - Action: Add `nodejs` and `pnpm` to `packages` if not present. Add to `shell.scripts`: `deploy:book-data` → `cd apps/deployer && pnpm run upload:book-data`; `deploy:reader` → `cd apps/deployer && pnpm run deploy:reader`; `deploy:all` → `cd apps/deployer && pnpm run deploy:all` (runs upload then deploy:reader; intended when `VITE_BOOK_DATA_URL` is already set—e.g. after first upload. For first-time: run deploy:book-data, set URL, then deploy:reader).
  - Notes: Document one-time `pnpm install` in apps/deployer (or root with workspaces) in deployer README. After adding nodejs/pnpm, verify existing devbox scripts (dev, build, crawl, pipeline, etc.) still run correctly.

- [x] Task 6: Update related documentation
  - File: `README.md`, `_bmad-output/project-context.md`
  - Action: Root README: Add **Deployment** section (or extend Usage): deployment without public GitHub; book-data → Vercel Blob, reader → Vercel static; link to `apps/deployer/README.md`; list `devbox run deploy:book-data`, `deploy:reader`, `deploy:all`. Optionally add `apps/deployer/` to Project Structure. project-context.md: In Monorepo & tooling, add deployer and deploy commands (`deploy:book-data`, `deploy:reader`, `deploy:all` → apps/deployer; run via `devbox run deploy:...` from repo root).

### Acceptance Criteria

- [x] AC 1: Given `BOOK_DATA_SRC` (or default) points at a directory with `index.json` and at least one `vbeta/.../book.json`, when the upload script runs with valid `BLOB_READ_WRITE_TOKEN`, then every file is uploaded to Vercel Blob with pathname `book-data/<relative path>` (forward slashes), and fetching `{BlobStoreRoot}/book-data/index.json` in a browser returns the catalog JSON.

- [x] AC 2: Given the same source directory, when the script runs with `--dry-run`, then no uploads occur, the script logs the pathnames that would be uploaded, and exits 0.

- [x] AC 3: Given `VITE_BOOK_DATA_URL` is set to the Blob store root and the reader builds successfully, when the deploy-reader script runs (Vercel CLI authenticated via `vercel login` or `VERCEL_TOKEN`), then the reader is deployed as a static site; when the user opens the app and navigates to the library, the catalog loads from Blob. (Vercel Blob public URLs allow browser fetches; if CORS issues appear, configure the Blob store per Vercel docs.)

- [x] AC 4: Given a maintainer with a new clone, when they follow `apps/deployer/README.md` (create Blob store, set token, upload, set VITE_BOOK_DATA_URL, deploy:reader), then they can deploy book-data and reader without linking the repo to GitHub.

- [x] AC 5: Deployment of book-data and reader does not require the repository to be public or linked to Vercel via Git; all steps work via CLI and tokens.

- [x] AC 6: Given devbox is installed and apps/deployer dependencies are installed, when the user runs `devbox run deploy:book-data` from repo root (with `BLOB_READ_WRITE_TOKEN` set), then book-data is uploaded (script resolves default source path from repo root via script location). When they run `devbox run deploy:reader` (with `VITE_BOOK_DATA_URL` set), then the reader is deployed. When they run `devbox run deploy:all` (with `VITE_BOOK_DATA_URL` already set), then upload runs first, then reader deploy.

- [x] AC 7: Given the implementation is complete, when a maintainer reads root `README.md`, then a Deployment section exists and points to `apps/deployer/README.md` and lists devbox commands; when they read `_bmad-output/project-context.md`, then the monorepo/tooling section mentions the deployer app and devbox deploy commands.

## Additional Context

### Dependencies

- Vercel CLI (blob + deploy). `BLOB_READ_WRITE_TOKEN` is issued for a specific Blob store; create one store (e.g. `book-data`) and use its token.
- Reader build requires `VITE_BOOK_DATA_URL` set to Blob store root when building for production.
- Vercel CLI auth: `vercel login` (interactive) or `VERCEL_TOKEN` (CI/non-interactive).

### Testing Strategy

- **Minimum:** Run upload script with `--dry-run` and assert exit 0 and that pathnames are logged; optionally run against a small fixture directory and verify one file appears at the expected Blob pathname (or that dry-run output matches expected pathnames).
- Manual: after upload, open Blob store URL + `/book-data/index.json` in browser; after reader deploy, open reader URL and confirm catalog loads.

### Notes

- Crawler output: `apps/crawler/data/book-data/` (config `output_dir: data` in config.yaml). Contains `index.json` and `vbeta/{cat}/{book_seo}/book.json` plus `images/` etc.
- Reader uses `resolveBookDataBaseUrl()` and requests `base + '/book-data/' + path`; hence Blob pathnames must be `book-data/index.json`, `book-data/vbeta/...`.
- **Env:** Scripts read `process.env`. Users set variables via `export` or via a `.env` file in `apps/deployer` if scripts load it (e.g. dotenv).
- **New vs modified:** New files under `apps/deployer/` (see frontmatter `files_to_create`); modified files: `devbox.json`, root `README.md`, `_bmad-output/project-context.md`.
