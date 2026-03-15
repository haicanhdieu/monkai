# Deployer

Scripts to deploy **book-data** to Vercel Blob or Cloudflare R2 and the **reader** as a static web app, without linking the repository to GitHub or Vercel via Git.

## Purpose

- Upload the crawler’s book-data tree (e.g. `apps/crawler/data/book-data/`) to **Vercel Blob** or **Cloudflare R2** so the reader can load catalog and book JSON/images from a public URL.
- Build and deploy the **reader** as a static site (e.g. via Vercel CLI) so the full stack runs without exposing source on a public repo.

## Prerequisites

- **Node.js 18+** and **pnpm**
- **Vercel CLI**: `npm i -g vercel` or use `npx vercel` (as in the scripts)
- **Devbox** (optional): run from repo root with `devbox run deploy:book-data` etc.

## One-time setup

### 1. Environment file

Copy the example env file and fill in your values:

```bash
cp apps/deployer/scripts/.env.example apps/deployer/scripts/.env
# Edit apps/deployer/scripts/.env with your tokens and URLs
```

Scripts load variables from `apps/deployer/scripts/.env` (and from the process environment). Do not commit `.env`; `.env.example` is committed as a template.

### 2. Vercel Blob store (if using Blob for book-data)

1. Create a Vercel Blob store (e.g. name `book-data`) in the [Vercel Dashboard](https://vercel.com/dashboard) (Storage → Blob).
2. Copy the **read-write token** for that store (token is scoped to the store).
3. Add `BLOB_READ_WRITE_TOKEN=...` to `apps/deployer/scripts/.env` (or export before running).

### 3. Cloudflare R2 (if using R2 for book-data)

1. In [Cloudflare Dashboard](https://dash.cloudflare.com) go to R2 → create a bucket (e.g. `book-data`).
2. Enable **Public access** for the bucket (R2 → bucket → Settings → Public access) and note the public URL (e.g. `https://pub-xxxx.r2.dev`).
3. Create R2 API tokens: R2 → Manage R2 API Tokens → Create API token (Object Read & Write). Note Account ID, Access Key ID, Secret Access Key.
4. Add to `apps/deployer/scripts/.env`:
   - `CLOUDFLARE_ACCOUNT_ID=...`
   - `R2_ACCESS_KEY_ID=...`
   - `R2_SECRET_ACCESS_KEY=...`
   - `R2_BUCKET_NAME=...`
5. Set `VITE_BOOK_DATA_URL` to the R2 public URL (no trailing slash).

### 4. Vercel CLI auth

- **Local:** run `vercel login` once.
- **CI / non-interactive:** set `VERCEL_TOKEN` in `.env` or environment (create in Vercel Dashboard → Settings → Tokens).

### 5. Install deployer dependencies

From repo root (with Devbox) or from `apps/deployer`:

```bash
cd apps/deployer && pnpm install
```

## Commands

From **repo root** with Devbox:

- `devbox run deploy:book-data` — upload book-data to Vercel Blob (requires `BLOB_READ_WRITE_TOKEN`).
- `devbox run deploy:book-data:r2` — upload book-data to Cloudflare R2 (requires R2 env vars).
- `devbox run deploy:reader` — build and deploy the reader (requires `VITE_BOOK_DATA_URL`).
- `devbox run deploy:all` — upload to Blob then deploy reader (when using Blob; set `VITE_BOOK_DATA_URL` first).

Without Devbox:

```bash
cd apps/deployer
# Use scripts/.env or export variables

# Option A: Vercel Blob
pnpm run upload:book-data
# Set VITE_BOOK_DATA_URL to the printed Blob store root URL, then:
pnpm run deploy:reader

# Option B: Cloudflare R2
pnpm run upload:book-data:r2
# Set VITE_BOOK_DATA_URL to your R2 public URL (e.g. https://pub-xxxx.r2.dev), then:
pnpm run deploy:reader
```

## First-time deploy flow

1. Copy `scripts/.env.example` to `scripts/.env` and fill in tokens/URLs.
2. Run **book-data upload** once:
   - Blob: `pnpm run upload:book-data` (prints Blob store root URL).
   - R2: `pnpm run upload:book-data:r2` (set `VITE_BOOK_DATA_URL` to your R2 public URL).
3. Set `VITE_BOOK_DATA_URL` in `scripts/.env` (no trailing slash).
4. Run **reader deploy**: `pnpm run deploy:reader`.

After that, re-run the upload script when book-data changes, then `deploy:reader` (or `deploy:all` when using Blob).

## Environment variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `BLOB_READ_WRITE_TOKEN` | For Blob upload | Token for the Vercel Blob store (from store settings). |
| `CLOUDFLARE_ACCOUNT_ID` | For R2 upload | Cloudflare account ID (R2 → Manage R2 API Tokens). |
| `R2_ACCESS_KEY_ID` | For R2 upload | R2 API token access key. |
| `R2_SECRET_ACCESS_KEY` | For R2 upload | R2 API token secret. |
| `R2_BUCKET_NAME` | For R2 upload | R2 bucket name. |
| `BOOK_DATA_SRC` | No | Source directory for book-data. Default: `apps/crawler/data/book-data`. |
| `VITE_BOOK_DATA_URL` | For reader deploy | Book-data root URL (no trailing slash): Blob store root or R2 public URL. |
| `VERCEL_TOKEN` | For CI | Vercel auth token for non-interactive deploy. |
| `VITE_BASE_PATH` | No | Base path for the reader (default `/`). Set if the app is served under a path (e.g. `/monkai/`). |

## Dry run

To log pathnames that would be uploaded without uploading:

```bash
cd apps/deployer && pnpm run upload:book-data -- --dry-run
# or
pnpm run upload:book-data:r2 -- --dry-run
```

## Notes

- Book-data object keys are `book-data/<relative path>` in both Blob and R2 so the reader’s `VITE_BOOK_DATA_URL` can point at the store root and requests like `base + '/book-data/index.json'` resolve correctly.
- Vercel Blob public URLs are served with permissive CORS for browser fetches. For R2, enable public access on the bucket and use the provided public URL (e.g. `https://pub-xxxx.r2.dev`).
- `.env.example` is committed; copy it to `scripts/.env` and do not commit `.env`.
