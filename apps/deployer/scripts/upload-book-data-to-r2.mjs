/**
 * upload-book-data-to-r2.mjs — Upload crawler book-data tree to Cloudflare R2
 *
 * Walks BOOK_DATA_SRC (default: apps/crawler/data/book-data), uploads each file
 * with key book-data/<relative path>. Reader uses VITE_BOOK_DATA_URL = R2 public
 * bucket root so that base + '/book-data/' + path resolves correctly.
 *
 * R2 is S3-compatible. Enable public access on the bucket in Cloudflare dashboard
 * (R2 → bucket → Settings → Public access) and set VITE_BOOK_DATA_URL to that
 * URL (e.g. https://pub-xxxx.r2.dev, no trailing slash).
 *
 * Usage: node scripts/upload-book-data-to-r2.mjs [--dry-run]
 * Env: CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME (required);
 *      BOOK_DATA_SRC (optional)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEPLOYER_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(DEPLOYER_ROOT, '..', '..')
const ENV_FILE = path.join(__dirname, '.env')

const DEFAULT_BOOK_DATA_SRC = path.join(REPO_ROOT, 'apps', 'crawler', 'data', 'book-data')

function loadEnvIfNeeded() {
  const required = ['CLOUDFLARE_ACCOUNT_ID', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET_NAME']
  if (required.every((k) => process.env[k])) return
  if (!fs.existsSync(ENV_FILE)) return
  const content = fs.readFileSync(ENV_FILE, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))
      value = value.slice(1, -1)
    process.env[key] = value
  }
}

const MIME_BY_EXT = {
  '.json': 'application/json',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
}

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase()
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

function* walkDir(dir, baseDir = dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      yield* walkDir(full, baseDir)
    } else if (entry.isFile()) {
      yield path.relative(baseDir, full)
    }
  }
}

function main() {
  loadEnvIfNeeded()
  const dryRun = process.argv.includes('--dry-run')
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const bucket = process.env.R2_BUCKET_NAME
  const bookDataSrc = process.env.BOOK_DATA_SRC
    ? path.resolve(process.cwd(), process.env.BOOK_DATA_SRC)
    : DEFAULT_BOOK_DATA_SRC

  if ((!accountId || !accessKeyId || !secretAccessKey || !bucket) && !dryRun) {
    console.error(
      'CLOUDFLARE_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET_NAME are required. Set them or run with --dry-run.'
    )
    process.exit(1)
  }

  if (!fs.existsSync(bookDataSrc)) {
    console.error(`Book-data source not found: ${bookDataSrc}`)
    process.exit(1)
  }

  const files = [...walkDir(bookDataSrc)]
  if (files.length === 0) {
    console.log('No files to upload in', bookDataSrc)
    process.exit(0)
  }

  if (dryRun) {
    const pathnames = files.map((rel) => 'book-data/' + rel.replaceAll(path.sep, '/'))
    pathnames.forEach((p) => console.log(p))
    process.exit(0)
  }

  runUpload(bookDataSrc, files).catch((err) => {
    console.error('Upload failed:', err.message || err)
    process.exit(1)
  })
}

async function runUpload(bookDataSrc, files) {
  const LOG_EVERY = 50
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const endpoint = `https://${accountId}.r2.cloudflarestorage.com`

  const s3 = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
  })

  const bucketName = process.env.R2_BUCKET_NAME

  for (let i = 0; i < files.length; i++) {
    const rel = files[i]
    const key = 'book-data/' + rel.replaceAll(path.sep, '/')
    const fullPath = path.join(bookDataSrc, rel)
    const body = fs.readFileSync(fullPath)
    const contentType = getContentType(fullPath)

    await s3.send(
      new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      })
    )

    if ((i + 1) % LOG_EVERY === 0) {
      console.log(`Uploaded ${i + 1}/${files.length} files...`)
    }
  }

  console.log(`Done. Uploaded ${files.length} files to R2 bucket "${bucketName}".`)
  console.log('')
  console.log('Set VITE_BOOK_DATA_URL to your R2 public bucket URL (no trailing slash),')
  console.log('e.g. https://pub-xxxx.r2.dev — enable Public access in R2 → bucket → Settings.')
}

main()
