# Deployer

Scripts to deploy **book-data** to Vercel Blob and the **reader** as a static web app, without linking the repository to GitHub or Vercel via Git.

## Purpose

- Upload the crawler’s book-data tree (e.g. `apps/crawler/data/book-data/`) to a **Vercel Blob** store so the reader can load catalog and book JSON/images from a public URL.
- Build and deploy the **reader** as a static site (e.g. via Vercel CLI) so the full stack runs without exposing source on a public repo.

## Prerequisites

- **Node.js 18+** and **pnpm**
- **Vercel CLI**: `npm i -g vercel` or use `npx vercel` (as in the scripts)
- **Devbox** (optional): run from repo root with `devbox run deploy:book-data` etc.

## One-time setup

### 1. Vercel Blob store

1. Create a Vercel Blob store (e.g. name `book-data`) in the [Vercel Dashboard](https://vercel.com/dashboard) (Storage → Blob).
2. Copy the **read-write token** for that store (token is scoped to the store).
3. Set the token:
   - **Option A:** `export BLOB_READ_WRITE_TOKEN=...`
   - **Option B:** Create `apps/deployer/.env` and add `BLOB_READ_WRITE_TOKEN=...` (you can use a tool like `dotenv` in the scripts if you add it; otherwise export before running).

### 2. Vercel CLI auth

- **Local:** run `vercel login` once.
- **CI / non-interactive:** set `VERCEL_TOKEN` (create in Vercel Dashboard → Settings → Tokens).

### 3. Install deployer dependencies

From repo root (with Devbox) or from `apps/deployer`:

```bash
cd apps/deployer && pnpm install
```

## Commands

From **repo root** with Devbox:

- `devbox run deploy:book-data` — upload book-data to Vercel Blob (requires `BLOB_READ_WRITE_TOKEN`).
- `devbox run deploy:reader` — build and deploy the reader (requires `VITE_BOOK_DATA_URL`).
- `devbox run deploy:all` — run upload then reader deploy (intended when `VITE_BOOK_DATA_URL` is already set).

Without Devbox:

```bash
cd apps/deployer
export BLOB_READ_WRITE_TOKEN=...
pnpm run upload:book-data

# After first upload, set VITE_BOOK_DATA_URL to the printed Blob store root URL, then:
export VITE_BOOK_DATA_URL=https://your-store.public.blob.vercel-storage.com
pnpm run deploy:reader
```

## First-time deploy flow

1. Run **book-data upload** once: `devbox run deploy:book-data` (or `cd apps/deployer && pnpm run upload:book-data`).
2. The script prints the **Blob store root URL**. Set `VITE_BOOK_DATA_URL` to that URL (no trailing slash), e.g. in `.env` or `export`.
3. Run **reader deploy**: `devbox run deploy:reader` (or `pnpm run deploy:reader` from `apps/deployer`).

After that, you can run `deploy:all` when both env vars are set (e.g. re-upload book-data and redeploy reader).

## Environment variables

| Variable | Required | Description |
| -------- | -------- | ----------- |
| `BLOB_READ_WRITE_TOKEN` | For upload | Token for the Vercel Blob store (from store settings). |
| `BOOK_DATA_SRC` | No | Source directory for book-data. Default: `apps/crawler/data/book-data` (resolved from repo layout). |
| `VITE_BOOK_DATA_URL` | For reader deploy | Blob store root URL (no trailing slash). Same value the reader uses at build time to fetch `/book-data/*`. |
| `VERCEL_TOKEN` | For CI | Vercel auth token for non-interactive deploy. |
| `VITE_BASE_PATH` | No | Base path for the reader (default `/`). Set if the app is served under a path (e.g. `/monkai/`). |

## Dry run

To log pathnames that would be uploaded without uploading:

```bash
cd apps/deployer && pnpm run upload:book-data -- --dry-run
```

## Notes

- Book-data pathnames in Blob are `book-data/<relative path>` so that the reader’s `VITE_BOOK_DATA_URL` can point at the store root and requests like `base + '/book-data/index.json'` resolve correctly.
- Vercel Blob public URLs are served with permissive CORS for browser fetches. If you hit CORS issues, configure the Blob store per [Vercel Blob docs](https://vercel.com/docs/storage/vercel-blob).
