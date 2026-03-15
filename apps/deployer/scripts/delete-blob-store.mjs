/**
 * delete-blob-store.mjs — Delete a Vercel Blob store by ID
 *
 * Loads apps/deployer/scripts/.env (VERCEL_TOKEN), runs vercel blob delete-store.
 *
 * Usage: node scripts/delete-blob-store.mjs <store-id>
 * Example: node scripts/delete-blob-store.mjs wg8tddck5q0jbc1n
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEPLOYER_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(DEPLOYER_ROOT, '..', '..')
const ENV_FILE = path.join(__dirname, '.env')

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error('Missing .env at', filePath)
    process.exit(1)
  }
  const content = fs.readFileSync(filePath, 'utf8')
  const env = { ...process.env }
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1)
    env[key] = value
  }
  return env
}

function main() {
  let storeId = process.argv[2]
  if (!storeId) {
    console.error('Usage: node scripts/delete-blob-store.mjs <store-id>')
    console.error('Example: node scripts/delete-blob-store.mjs wg8tddck5q0jbc1n')
    process.exit(1)
  }
  storeId = storeId.toLowerCase()

  const env = loadEnv(ENV_FILE)
  if (!env.VERCEL_TOKEN) {
    console.error('VERCEL_TOKEN is required in', ENV_FILE)
    process.exit(1)
  }

  const runOpts = { env: { ...process.env, ...env, CI: '1' } }
  const result = spawnSync(
    'npx',
    ['vercel', 'blob', 'delete-store', storeId],
    { cwd: REPO_ROOT, stdio: 'inherit', shell: true, ...runOpts }
  )

  if (result.status !== 0) {
    console.error('')
    console.error('If you see "Store not found (404)": suspended stores often cannot be deleted via CLI.')
    console.error('  • Delete in dashboard: https://vercel.com/dashboard/storage → select store → Delete')
    console.error('  • Or contact Vercel support to remove it: https://vercel.com/help')
    process.exit(result.status ?? 1)
  }
  process.exit(0)
}

main()
