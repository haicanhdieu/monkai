import http from 'http'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BOOK_DATA_DIR = path.resolve(__dirname, '../../book-data')
const PORT = 3001

const server = http.createServer((req, res) => {
    // Strip /book-data prefix if present
    const urlPath = req.url.replace(/^\/book-data/, '') || '/index.json'
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
