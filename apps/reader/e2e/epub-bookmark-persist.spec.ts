/**
 * Regression: the auto last-read bookmark must survive a browser refresh even when the
 * reader is left immediately after opening (within the 300ms bookmark-save debounce).
 *
 * Bug: ReaderEngine cleanup cleared the pending debounce timer without flushing the write,
 * so fast-loading onedrive epubs lost their auto bookmark when the user backed out quickly.
 * Last-read (home card) survived because it is written synchronously, but the bookmark page
 * entry vanished after refresh. JSON books masked the bug because building their epub blob
 * delays the reader long enough for the debounce to fire before the user navigates.
 *
 * Run:
 *   npx playwright test e2e/epub-bookmark-persist-debug.spec.ts --reporter=line --project=mobile-chrome
 */
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const EPUB_BYTES = readFileSync(resolve(__dirname, '../../onedrive-sync/tests/fixtures/sample.epub'))

const BOOK_ID = '93804ab0-2015-43a3-8a52-cd7e9ba8f935'

const ONEDRIVE_INDEX = {
  books: [
    {
      id: BOOK_ID,
      book_name: 'Onedrive Epub Test',
      author: 'Test Author',
      category_name: 'Sách',
      cover_image_url: null,
      epubUrl: 'onedrive/sample.epub',
      source: 'onedrive',
    },
  ],
}
const EMPTY_INDEX = { books: [] as unknown[] }

async function routeAll(page: import('@playwright/test').Page) {
  await page.route('**/book-data/onedrive/index.json', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ONEDRIVE_INDEX) }))
  await page.route('**/book-data/vnthuquan/index.json', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_INDEX) }))
  await page.route('**/book-data/vbeta/index.json', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_INDEX) }))
  await page.route('**/book-data/onedrive/sample.epub', (r) =>
    r.fulfill({ status: 200, contentType: 'application/epub+zip', body: EPUB_BYTES }))
}

async function readBookmarks(page: import('@playwright/test').Page): Promise<unknown[] | undefined> {
  return page.evaluate(
    () => new Promise<unknown[] | undefined>((resolve) => {
      const req = indexedDB.open('localforage')
      req.onsuccess = (e) => {
        const db = (e.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains('keyvaluepairs')) { db.close(); resolve(undefined); return }
        const tx = db.transaction('keyvaluepairs', 'readonly')
        const gr = tx.objectStore('keyvaluepairs').get('bookmarks')
        gr.onsuccess = () => { db.close(); resolve(gr.result as unknown[] | undefined) }
        gr.onerror = () => { db.close(); resolve(undefined) }
      }
      req.onerror = () => resolve(undefined)
    }),
  )
}

test('auto bookmark survives refresh when leaving the reader immediately', async ({ page }) => {
  test.setTimeout(90000)
  await routeAll(page)

  // Open the onedrive epub from the library (nav state carries source=vnthuquan)
  await page.goto('/library')
  await page.getByRole('button', { name: 'Sách & Truyện' }).tap()
  await page.getByPlaceholder('Tìm kiếm sách & truyện...').fill('Onedrive Epub Test')
  const card = page.getByText('Onedrive Epub Test', { exact: false }).first()
  await expect(card).toBeVisible({ timeout: 15000 })
  await card.tap()

  // As soon as the first page renders, leave via the in-app back button (SPA navigation,
  // no full reload) — this is the path that previously dropped the auto bookmark.
  await expect(page.getByTestId('epub-container')).toBeVisible({ timeout: 30000 })
  await expect(page.locator('[aria-live="polite"][aria-atomic="true"]')).not.toBeEmpty({ timeout: 25000 })
  await page.getByTestId('chrome-back').click()
  await expect(page).toHaveURL(/\/library/, { timeout: 10000 })

  // The unmount flush is an async localforage write — give it a moment to commit.
  await page.waitForTimeout(500)
  const beforeRefresh = await readBookmarks(page)
  expect(beforeRefresh, 'auto bookmark should be persisted on back navigation').toBeTruthy()
  expect(beforeRefresh!.length).toBe(1)

  // Refresh the browser — the auto bookmark must still be there.
  await page.reload()
  await routeAll(page)
  await page.waitForTimeout(1000)
  const afterRefresh = await readBookmarks(page)
  expect(afterRefresh, 'auto bookmark should survive refresh').toBeTruthy()
  expect(afterRefresh!.length).toBe(1)
  expect((afterRefresh![0] as { bookId: string }).bookId).toBe(BOOK_ID)

  // And it must appear on the bookmarks page after refresh.
  await page.goto('/bookmarks')
  await routeAll(page)
  await expect(page.getByTestId('bookmark-group')).toHaveCount(1, { timeout: 10000 })
})
