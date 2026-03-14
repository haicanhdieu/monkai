/**
 * upload-book-data-to-blob.mjs — Upload crawler book-data tree to Vercel Blob
 *
 * Walks BOOK_DATA_SRC (default: apps/crawler/data/book-data), uploads each file
 * with pathname book-data/<relative path>. Reader uses VITE_BOOK_DATA_URL = Blob
 * store root so that base + '/book-data/' + path resolves correctly.
 *
 * Usage: node scripts/upload-book-data-to-blob.mjs [--dry-run]
 * Env: BLOB_READ_WRITE_TOKEN (required), BOOK_DATA_SRC (optional)
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { put } from '@vercel/blob'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEPLOYER_ROOT = path.resolve(__dirname, '..')
const REPO_ROOT = path.resolve(DEPLOYER_ROOT, '..', '..')

const DEFAULT_BOOK_DATA_SRC = path.join(REPO_ROOT, 'apps', 'crawler', 'data', 'book-data')

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
  const dryRun = process.argv.includes('--dry-run')
  const token = process.env.BLOB_READ_WRITE_TOKEN
  const bookDataSrc = process.env.BOOK_DATA_SRC
    ? path.resolve(process.cwd(), process.env.BOOK_DATA_SRC)
    : DEFAULT_BOOK_DATA_SRC

  if (!token && !dryRun) {
    console.error('BLOB_READ_WRITE_TOKEN is required. Set it or run with --dry-run.')
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
    console.error('Upload failed:', err)
    process.exit(1)
  })
}

async function runUpload(bookDataSrc, files) {
  const LOG_EVERY = 50
  let blobStoreRoot = null

  for (let i = 0; i < files.length; i++) {
    const rel = files[i]
    const pathname = 'book-data/' + rel.replaceAll(path.sep, '/')
    const fullPath = path.join(bookDataSrc, rel)
    const body = fs.readFileSync(fullPath)
    const contentType = getContentType(fullPath)

    const result = await put(pathname, body, {
      access: 'public',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType,
    })

    if (result?.url) {
      if (blobStoreRoot == null) {
        const u = new URL(result.url)
        blobStoreRoot = u.origin
        console.log('Blob store root URL (set VITE_BOOK_DATA_URL to this):', blobStoreRoot)
      }
    }

    if ((i + 1) % LOG_EVERY === 0) {
      console.log(`Uploaded ${i + 1}/${files.length} files...`)
    }
  }

  console.log(`Done. Uploaded ${files.length} files.`)
  if (blobStoreRoot) {
    console.log('VITE_BOOK_DATA_URL=', blobStoreRoot)
  }
}

main()
