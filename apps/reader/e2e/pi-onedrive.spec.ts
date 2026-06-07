/**
 * Pi server onedrive integration tests.
 *
 * Requires a live Pi server with onedrive epub data already synced.
 * Set PLAYWRIGHT_TEST_BASE_URL to the reader app URL (e.g. http://192.168.1.225:5173)
 * and VITE_BOOK_DATA_URL to the Pi book-data base (e.g. http://192.168.1.225:8080).
 *
 * Skips automatically when PI_ONEDRIVE_TEST is not set to 'true'.
 */

import { test, expect } from '@playwright/test'

const PI_BOOK_DATA_URL = process.env.VITE_BOOK_DATA_URL ?? 'http://192.168.1.225:8080'

type CatalogBook = {
  id: string
  book_name: string
  author?: string | null
  epubUrl?: string
  source?: string
}

type CatalogIndex = {
  books: CatalogBook[]
}

test.describe('onedrive books on Pi server', () => {
  test.skip(
    process.env.PI_ONEDRIVE_TEST !== 'true',
    'Skipped: set PI_ONEDRIVE_TEST=true to run Pi integration tests',
  )

  let onedriveBook: CatalogBook | undefined

  test.beforeAll(async ({ request }) => {
    // Fetch the onedrive index directly from the Pi to discover available books
    const res = await request.get(`${PI_BOOK_DATA_URL}/book-data/onedrive/index.json`)
    if (!res.ok()) {
      throw new Error(`Pi onedrive index.json not reachable: ${res.status()} ${PI_BOOK_DATA_URL}`)
    }
    const index = (await res.json()) as CatalogIndex
    onedriveBook = index.books.find((b) => b.epubUrl || b.source === 'onedrive')
    if (!onedriveBook) {
      throw new Error('No onedrive books found in Pi index.json — sync at least one epub first')
    }
  })

  test('onedrive/index.json is reachable and has books', async ({ request }) => {
    const res = await request.get(`${PI_BOOK_DATA_URL}/book-data/onedrive/index.json`)
    expect(res.ok()).toBe(true)
    const index = (await res.json()) as CatalogIndex
    expect(index.books.length).toBeGreaterThan(0)
    // At least one book must have an epubUrl (set by the Epic 1 import pipeline)
    const withEpub = index.books.filter((b) => b.epubUrl)
    expect(withEpub.length).toBeGreaterThan(0)
  })

  test('Sách Truyện shows onedrive books merged with vnthuquan', async ({ page }) => {
    await page.goto('/')
    // Tap the Sách & Truyện pill to switch to that bucket
    await page.getByRole('button', { name: 'Sách & Truyện' }).tap()
    // Wait for at least one book card to appear in the library list
    await expect(page.locator('[aria-label^="Đọc "]').first()).toBeVisible({ timeout: 15000 })
    // The onedrive book title must appear somewhere in the library
    if (onedriveBook) {
      await expect(page.getByText(onedriveBook.book_name, { exact: false })).toBeVisible({ timeout: 10000 })
    }
    // Verify 'onedrive' string is NOT visible as a source label
    expect(await page.locator('text=onedrive').count()).toBe(0)
  })

  test('tapping an onedrive book opens the epub reader', async ({ page }) => {
    if (!onedriveBook) {
      test.skip()
      return
    }
    await page.goto('/')
    await page.getByRole('button', { name: 'Sách & Truyện' }).tap()
    // Navigate directly to the reader using the book id
    await page.goto(`/read/${onedriveBook.id}`)
    // epub-container becomes visible when epub.js has rendered the first page
    await expect(page.getByTestId('epub-container')).toBeVisible({ timeout: 30000 })
    // Page navigation zones must be present (identical experience to vnthuquan)
    await expect(page.getByTestId('tap-prev')).toBeAttached()
    await expect(page.getByTestId('tap-next')).toBeAttached()
  })

  test('epub file is fetchable from Pi with CORS headers', async ({ request }) => {
    if (!onedriveBook?.epubUrl) {
      test.skip()
      return
    }
    // epubUrl in the catalog is relative; resolve it manually here
    const epubPath = onedriveBook.epubUrl.startsWith('http')
      ? onedriveBook.epubUrl
      : `${PI_BOOK_DATA_URL}/book-data/${onedriveBook.epubUrl.replace(/^\/+/, '')}`
    const res = await request.head(epubPath)
    expect(res.ok()).toBe(true)
    const corsHeader = res.headers()['access-control-allow-origin']
    expect(corsHeader).toBe('*')
  })

  test('searching by author finds onedrive books', async ({ page }) => {
    if (!onedriveBook?.author) {
      test.skip()
      return
    }
    await page.goto('/')
    await page.getByRole('button', { name: 'Sách & Truyện' }).tap()
    const searchInput = page.getByPlaceholder('Tìm kiếm sách & truyện...')
    await searchInput.fill(onedriveBook.author)
    // At least one result matching the book title must appear
    await expect(page.getByText(onedriveBook.book_name, { exact: false })).toBeVisible({ timeout: 10000 })
  })

  test('first visit: search Khi Người Ta Tư Duy and epub opens without hanging', async ({ page }) => {
    test.setTimeout(120000)

    // Navigate to app origin first so IndexedDB API is accessible, then wipe all
    // databases to simulate a true first visit with no cached catalog/epub data.
    await page.goto('/library')
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases()
      await Promise.all(
        dbs.map(
          (db) =>
            new Promise<void>((resolve) => {
              if (!db.name) { resolve(); return }
              const req = indexedDB.deleteDatabase(db.name)
              req.onsuccess = () => resolve()
              req.onerror = () => resolve()
            }),
        ),
      )
    })

    // Reload to start with empty cache, then switch to Sách & Truyện source
    await page.goto('/library')
    await page.getByRole('button', { name: 'Sách & Truyện' }).tap()

    // Search for the target book (catalog must load from Pi first — may take a few seconds)
    const searchInput = page.getByPlaceholder('Tìm kiếm sách & truyện...')
    await searchInput.fill('Khi Người Ta Tư Duy')

    // Book card must appear in search results
    const bookCard = page.getByText('Khi Người Ta Tư Duy', { exact: false }).first()
    await expect(bookCard).toBeVisible({ timeout: 30000 })
    await bookCard.tap()

    // epub-container becomes visible once epub.js renders the first page
    await expect(page.getByTestId('epub-container')).toBeVisible({ timeout: 90000 })
    // Navigation zones confirm reader is fully interactive
    await expect(page.getByTestId('tap-prev')).toBeAttached({ timeout: 5000 })
    await expect(page.getByTestId('tap-next')).toBeAttached({ timeout: 5000 })
  })
})
