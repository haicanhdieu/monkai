/**
 * upload-book-data-to-r2.mjs — Sync local book-data tree to Cloudflare R2 (incremental)
 *
 * Compares local files against R2 objects using MD5 ETags and only uploads
 * new or changed files. Optionally deletes R2 objects that no longer exist locally.
 *
 * R2 is S3-compatible. Enable public access on the bucket in the Cloudflare dashboard
 * (R2 → bucket → Settings → Public access) and set VITE_BOOK_DATA_URL to that URL.
 *
 * Usage:
 *   node scripts/upload-book-data-to-r2.mjs [options]
 *
 * Options:
 *   --dry-run        Show what would change without uploading or deleting
 *   --delete-stale   Delete R2 objects that don't exist locally
 *
 * Required env vars:
 *   CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME
 *
 * Optional env vars:
 *   BOOK_DATA_SRC   Local source directory (default: apps/book-data relative to repo root)
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import {
  S3Client,
  ListObjectsV2Command,
  PutObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEPLOYER_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(DEPLOYER_ROOT, '..', '..')
const ENV_FILE = path.join(__dirname, '.env')
const DEFAULT_BOOK_DATA_SRC = path.join(REPO_ROOT, 'apps', 'book-data')
const R2_PREFIX = 'book-data'

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2)
const DRY_RUN = args.includes('--dry-run')
const DELETE_STALE = args.includes('--delete-stale')

// ── Env loading ───────────────────────────────────────────────────────────────

function loadEnv() {
  const required = ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']
  if (required.every((k) => process.env[k])) return
  if (!fs.existsSync(ENV_FILE)) return
  for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
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

// ── Helpers ───────────────────────────────────────────────────────────────────

const MIME = {
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function mime(filePath) {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

function md5(buf) {
  return crypto.createHash('md5').update(buf).digest('hex')
}

const IGNORE = new Set(['.DS_Store', 'Thumbs.db', '.gitkeep', '.gitignore'])

/** Walk dir, yield relative paths (skips hidden/system files) */
function* walk(dir, base = dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE.has(entry.name) || entry.name.startsWith('.')) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full, base)
    else if (entry.isFile()) yield path.relative(base, full)
  }
}

/** List all objects under a prefix in R2, handling pagination */
async function listAll(s3, bucket, prefix) {
  const objects = new Map() // key → etag (without quotes)
  let token
  do {
    const res = await s3.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix + '/', MaxKeys: 1000, ContinuationToken: token })
    )
    for (const obj of res.Contents ?? []) {
      objects.set(obj.Key, (obj.ETag ?? '').replace(/"/g, ''))
    }
    token = res.NextContinuationToken
  } while (token)
  return objects
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  loadEnv()

  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME
  const bookDataSrc = process.env.BOOK_DATA_SRC
    ? path.resolve(process.cwd(), process.env.BOOK_DATA_SRC)
    : DEFAULT_BOOK_DATA_SRC

  if ((!accountId || !accessKeyId || !secretAccessKey || !bucket) && !DRY_RUN) {
    console.error('CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME are required.')
    process.exit(1)
  }

  if (!fs.existsSync(bookDataSrc)) {
    console.error(`Book-data source not found: ${bookDataSrc}`)
    process.exit(1)
  }

  if (DRY_RUN) console.log('[dry-run] No changes will be made.')
  console.log(`Source : ${bookDataSrc}`)
  console.log(`Bucket : ${bucket ?? '(not set)'}`)
  console.log(`Prefix : ${R2_PREFIX}/`)
  if (DELETE_STALE) console.log('Mode   : sync (upload new/changed + delete stale)')
  else console.log('Mode   : upload-only (new/changed; use --delete-stale to also remove stale keys)')
  console.log()

  // Build local file map: r2Key → { md5, fullPath, buf }
  const localFiles = new Map()
  for (const rel of walk(bookDataSrc)) {
    const fullPath = path.join(bookDataSrc, rel)
    const buf = fs.readFileSync(fullPath)
    const key = R2_PREFIX + '/' + rel.replaceAll(path.sep, '/')
    localFiles.set(key, { md5: md5(buf), fullPath, buf })
  }
  console.log(`Local files : ${localFiles.size}`)

  const s3 = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  })

  console.log('Listing R2 objects...')
  const r2Objects = await listAll(s3, bucket, R2_PREFIX)
  console.log(`R2 objects  : ${r2Objects.size}`)
  console.log()

  // Diff
  const toUpload = []
  const toDelete = []
  let unchanged = 0

  for (const [key, { md5: localMd5 }] of localFiles) {
    const r2Etag = r2Objects.get(key)
    if (!r2Etag) toUpload.push({ key, reason: 'new' })
    else if (r2Etag !== localMd5) toUpload.push({ key, reason: 'changed' })
    else unchanged++
  }

  if (DELETE_STALE) {
    for (const key of r2Objects.keys()) {
      if (!localFiles.has(key)) toDelete.push(key)
    }
  }

  console.log(`Unchanged   : ${unchanged}`)
  console.log(`To upload   : ${toUpload.length}`)
  if (DELETE_STALE) console.log(`To delete   : ${toDelete.length}`)

  if (toUpload.length === 0 && toDelete.length === 0) {
    console.log('\nAlready in sync. Nothing to do.')
    return
  }

  console.log()

  if (DRY_RUN) {
    for (const { key, reason } of toUpload) console.log(`  [${reason}]   ${key}`)
    for (const key of toDelete) console.log(`  [stale]   ${key}`)
    console.log('\nDry run complete — no changes made.')
    return
  }

  // Upload
  let uploaded = 0
  const LOG_EVERY = 50

  for (const { key } of toUpload) {
    const { fullPath, buf } = localFiles.get(key)
    await s3.send(
      new PutObjectCommand({ Bucket: bucket, Key: key, Body: buf, ContentType: mime(fullPath) })
    )
    uploaded++
    if (uploaded % LOG_EVERY === 0) console.log(`  Uploaded ${uploaded}/${toUpload.length}...`)
  }

  if (uploaded > 0) console.log(`  Uploaded ${uploaded} file(s).`)

  // Delete stale
  if (toDelete.length > 0) {
    const chunks = []
    for (let i = 0; i < toDelete.length; i += 1000) chunks.push(toDelete.slice(i, i + 1000))
    for (const chunk of chunks) {
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
        })
      )
    }
    console.log(`  Deleted ${toDelete.length} stale object(s):`)
    for (const key of toDelete) console.log(`    - ${key}`)
  }

  console.log('\nSync complete.')
  console.log()
  console.log('Set VITE_BOOK_DATA_URL to your R2 public bucket URL (no trailing slash),')
  console.log('e.g. https://pub-xxxx.r2.dev — enable Public access in R2 → bucket → Settings.')
}

main().catch((err) => {
  console.error('Error:', err.message ?? err)
  process.exit(1)
})
