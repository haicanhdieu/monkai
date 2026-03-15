/**
 * create-blob-token.mjs — Pull BLOB_READ_WRITE_TOKEN from linked Vercel project into deployer .env
 *
 * Uses the existing Blob store (monkai-blob) on the linked project. Loads apps/deployer/scripts/.env
 * (VERCEL_TOKEN), runs vercel env pull, and writes BLOB_READ_WRITE_TOKEN to the same .env for
 * upload-book-data-to-blob.mjs.
 *
 * Prerequisites: Project linked (vercel link) and has Blob store monkai-blob.
 *
 * Usage: node scripts/create-blob-token.mjs
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

function run(cmd, args, opts = {}) {
  const result = spawnSync(cmd, args, {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: true,
    ...opts,
  })
  return result
}

function main() {
  const env = loadEnv(ENV_FILE)

  if (!env.VERCEL_TOKEN) {
    console.error('VERCEL_TOKEN is required in', ENV_FILE)
    process.exit(1)
  }

  console.log('Using VERCEL_TOKEN from', ENV_FILE)
  console.log('Using existing Blob store: monkai-blob')

  const runOpts = { env: { ...process.env, ...env, CI: '1' } }
  const projectJson = path.join(REPO_ROOT, '.vercel', 'project.json')

  if (!fs.existsSync(projectJson)) {
    console.error('Project not linked. Run "npx vercel link" from repo root first.')
    process.exit(1)
  }

  const pullResult = run('npx', ['vercel', 'env', 'pull', '.env.local'], runOpts)
  if (pullResult.status !== 0) {
    console.error('vercel env pull failed.')
    process.exit(pullResult.status ?? 1)
  }

  const envLocalPath = path.join(REPO_ROOT, '.env.local')
  if (!fs.existsSync(envLocalPath)) {
    console.error('.env.local not found after pull.')
    process.exit(1)
  }

  const localContent = fs.readFileSync(envLocalPath, 'utf8')
  let blobToken = null
  for (const line of localContent.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('BLOB_READ_WRITE_TOKEN=')) {
      blobToken = trimmed.slice('BLOB_READ_WRITE_TOKEN='.length).trim()
      if ((blobToken.startsWith('"') && blobToken.endsWith('"')) || (blobToken.startsWith("'") && blobToken.endsWith("'")))
        blobToken = blobToken.slice(1, -1)
      break
    }
  }

  if (!blobToken) {
    console.error('BLOB_READ_WRITE_TOKEN not found in .env.local.')
    process.exit(1)
  }

  const deployerEnvContent = fs.readFileSync(ENV_FILE, 'utf8')
  if (deployerEnvContent.includes('BLOB_READ_WRITE_TOKEN=')) {
    console.log('BLOB_READ_WRITE_TOKEN already present in', ENV_FILE)
  } else {
    const append = deployerEnvContent.endsWith('\n') ? '' : '\n'
    fs.appendFileSync(ENV_FILE, append + 'BLOB_READ_WRITE_TOKEN=' + blobToken + '\n')
    console.log('Appended BLOB_READ_WRITE_TOKEN to', ENV_FILE)
  }

  console.log('Done. You can run: pnpm run upload:book-data')
}

main()
