/**
 * deploy-reader-static.mjs — Build and deploy the reader as a static site via Vercel CLI
 *
 * Requires VITE_BOOK_DATA_URL (Blob store root). Deploys from apps/reader with
 * Vercel CLI so no Git link is required.
 *
 * Usage: node scripts/deploy-reader-static.mjs
 * Env: VITE_BOOK_DATA_URL (required), VERCEL_TOKEN (optional, for CI), VITE_BASE_PATH (optional)
 */

import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEPLOYER_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(DEPLOYER_ROOT, '..', '..')
const READER_DIR = path.join(REPO_ROOT, 'apps', 'reader')

function main() {
  const bookDataUrl = process.env.VITE_BOOK_DATA_URL?.trim()
  if (!bookDataUrl) {
    console.error('VITE_BOOK_DATA_URL is required. Set it to your Vercel Blob store root URL.')
    process.exit(1)
  }

  const basePath = process.env.VITE_BASE_PATH ?? '/'
  const buildEnv = `VITE_BOOK_DATA_URL=${bookDataUrl}`
  const basePathEnv = `VITE_BASE_PATH=${basePath}`

  const result = spawnSync(
    'npx',
    [
      'vercel',
      'deploy',
      '--prod',
      '--yes',
      '--build-env',
      buildEnv,
      '--build-env',
      basePathEnv,
    ],
    {
      cwd: READER_DIR,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, VITE_BOOK_DATA_URL: bookDataUrl, VITE_BASE_PATH: basePath },
    },
  )

  if (result.status !== 0) {
    console.error('Vercel deploy failed. Ensure you are logged in: vercel login (or set VERCEL_TOKEN).')
    process.exit(result.status ?? 1)
  }

  console.log('Reader deployed. Check output above for deployment URL.')
}

main()
