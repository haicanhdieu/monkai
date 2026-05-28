/**
 * upload-book-data-to-onedrive.mjs — Sync book-data from Windows server to OneDrive via rclone
 *
 * Setup (one-time):
 *   1. Install rclone on Windows: https://rclone.org/downloads/
 *      (download the .zip, extract rclone.exe, add to PATH or place in the scripts dir)
 *   2. Configure OneDrive remote:
 *        rclone config
 *        # → n (new remote) → name: onedrive-monkai → type: onedrive
 *        # → follow OAuth prompts in browser to authorise
 *   3. Run this script from the deployer/scripts directory:
 *        node upload-book-data-to-onedrive.mjs [--dry-run]
 *
 * Usage:
 *   node upload-book-data-to-onedrive.mjs [--dry-run]
 *
 * Options:
 *   --dry-run   Show what would sync without uploading anything
 *
 * Env vars (set in .env or shell environment):
 *   ONEDRIVE_REMOTE   rclone remote name (default: onedrive-monkai)
 *   BOOK_DATA_SRC     Source directory (default: D:\ntm\monkai\apps\crawler\data\book-data)
 */

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_FILE = path.join(__dirname, '.env')

const DEFAULT_ONEDRIVE_REMOTE = 'onedrive-monkai'
const DEFAULT_BOOK_DATA_SRC = 'D:\\ntm\\monkai\\apps\\crawler\\data\\book-data'
const DEFAULT_ONEDRIVE_DEST_PATH = 'PUBLIC-DATA/MONKAI/book-data'

// ── Env loading ───────────────────────────────────────────────────────────────

function loadEnv() {
  if (!fs.existsSync(ENV_FILE)) return
  let content
  try {
    content = fs.readFileSync(ENV_FILE, 'utf8')
  } catch (err) {
    console.warn(`Warning: could not read .env: ${err.message}`)
    return
  }
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1)
    if (!process.env[key]) process.env[key] = value
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main() {
  loadEnv()

  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')

  const remote = process.env.ONEDRIVE_REMOTE || DEFAULT_ONEDRIVE_REMOTE
  const src = process.env.BOOK_DATA_SRC || DEFAULT_BOOK_DATA_SRC
  const destPath = process.env.ONEDRIVE_DEST_PATH || DEFAULT_ONEDRIVE_DEST_PATH
  const dest = `${remote}:${destPath}`

  if (!fs.existsSync(src)) {
    console.error(`Book-data source not found: ${src}`)
    process.exit(1)
  }

  const topLevelEntries = fs.readdirSync(src)
  if (topLevelEntries.length === 0) {
    console.error(`Book-data source directory is empty: ${src} — refusing to sync (would wipe OneDrive destination)`)
    process.exit(1)
  }

  const rcloneArgs = ['sync', src, dest, '--progress', '--stats-one-line']
  if (dryRun) rcloneArgs.push('--dry-run')

  console.log(`Source : ${src}`)
  console.log(`Dest   : ${dest}`)
  if (dryRun) console.log('[dry-run] No changes will be made.')
  console.log()
  console.log(`Running: rclone ${rcloneArgs.join(' ')}`)
  console.log()

  const result = spawnSync('rclone', rcloneArgs, { stdio: 'inherit' })

  if (result.error) {
    console.error(`Failed to run rclone: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    const detail = result.signal ? `signal ${result.signal}` : `exit code ${result.status}`
    console.error(`rclone failed (${detail})`)
    process.exit(result.status ?? 1)
  }

  if (dryRun) {
    console.log('\nDry run complete — no changes made.')
  } else {
    console.log('\nSync complete.')
  }
}

main()
