import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOOK_DATA_DIR = path.resolve(__dirname, '../../book-data')
const PORT = 3001

// Build UUID→artifact-path lookup map from index.json at startup so that
// requests like /book-data/{uuid}.json resolve to the correct vbeta/…/book.json file.
const uuidToPath = new Map()
try {
    const indexRaw = fs.readFileSync(path.join(BOOK_DATA_DIR, 'index.json'), 'utf-8')
    for (const book of JSON.parse(indexRaw)) {
        if (book.id && book.artifacts?.[0]?.path) {
            uuidToPath.set(book.id, book.artifacts[0].path)
        }
    }
    console.log(`Loaded ${uuidToPath.size} book entries from index.json`)
} catch (err) {
    console.error('Failed to load index.json:', err.message)
}

const UUID_RE = /^\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.json$/i

const server = http.createServer((req, res) => {
    // Strip /book-data prefix if present
    let urlPath = req.url.replace(/^\/book-data/, '') || '/index.json'

    // Resolve UUID requests: /book-data/{uuid}.json → vbeta/…/book.json
    const uuidMatch = urlPath.match(UUID_RE)
    if (uuidMatch) {
        const artifactPath = uuidToPath.get(uuidMatch[1])
        if (artifactPath) {
            urlPath = '/' + artifactPath
        }
    }

    const filePath = path.join(BOOK_DATA_DIR, urlPath)

    res.setHeader('Access-Control-Allow-Origin', 'http://localhost:5173')
    res.setHeader('Access-Control-Allow-Methods', 'GET')

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Not found' }))
            return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(data)
    })
})

server.listen(PORT, () => {
    console.log(`Mock server running on http://localhost:${PORT}`)
    console.log(`Serving book-data from: ${BOOK_DATA_DIR}`)
})
