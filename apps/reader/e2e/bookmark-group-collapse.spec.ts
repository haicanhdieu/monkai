/**
 * E2E: collapsible bookmark groups with durable per-book expand state.
 *
 * Covers the feature shipped in feat/bookmark-group-collapse:
 *  - groups render collapsed by default (item list hidden, summary line shown)
 *  - tapping the chevron expands the group and flips aria-expanded
 *  - the expanded state survives a full browser reload (persisted to localforage)
 *  - cover/title still navigates to the reader (collapse never hijacks the header link)
 *
 * Bookmarks are seeded straight into localforage (db `localforage`, store
 * `keyvaluepairs`) after the app has initialised the store, mirroring
 * epub-bookmark-persist.spec.ts.
 *
 * Run:
 *   npx playwright test e2e/bookmark-group-collapse.spec.ts --reporter=line --project=mobile-chrome
 */
import { test, expect } from '@playwright/test'
import type { Page } from '@playwright/test'

// Valid UUID bookId so useStorageHydration's isValidBookId keeps the seeded bookmarks.
const BOOK_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'
const EMPTY_INDEX = { books: [] as unknown[] }

const SEED_BOOKMARKS = [
  {
    bookId: BOOK_ID,
    bookTitle: 'Kinh Pháp Hoa',
    cfi: 'epubcfi(/6/2!/4/2/1:0)',
    timestamp: 2_000_000,
    type: 'auto',
    chapterTitle: 'Phẩm Phương Tiện',
  },
  {
    bookId: BOOK_ID,
    bookTitle: 'Kinh Pháp Hoa',
    cfi: 'epubcfi(/6/8!/4/2/1:0)',
    timestamp: 1_000_000,
    type: 'manual',
    chapterTitle: 'Phẩm Tựa',
  },
]

async function routeAll(page: Page) {
  for (const bucket of ['vbeta', 'vnthuquan', 'onedrive']) {
    await page.route(`**/book-data/${bucket}/index.json`, (r) =>
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EMPTY_INDEX) }))
  }
}

/** Write a key into localforage's IndexedDB store (structured-clone, not JSON). */
async function seedLocalforage(page: Page, key: string, value: unknown): Promise<void> {
  await page.evaluate(
    ({ key, value }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('localforage')
        req.onsuccess = (e) => {
          const db = (e.target as IDBOpenDBRequest).result
          const tx = db.transaction('keyvaluepairs', 'readwrite')
          tx.objectStore('keyvaluepairs').put(value, key)
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => { db.close(); reject(tx.error) }
        }
        req.onerror = () => reject(req.error)
      }),
    { key, value },
  )
}

test('bookmark groups collapse by default and the expanded state persists across reload', async ({ page }) => {
  test.setTimeout(60000)
  await routeAll(page)

  // Load the app once so localforage creates the `keyvaluepairs` store, then seed bookmarks.
  await page.goto('/')
  await expect(page.locator('#root')).toBeAttached()
  await page.waitForTimeout(500)
  await seedLocalforage(page, 'bookmarks', SEED_BOOKMARKS)
  await seedLocalforage(page, 'bookmark_group_state', [])

  // --- Default: collapsed ---
  await page.goto('/bookmarks')
  await routeAll(page)
  const group = page.getByTestId('bookmark-group')
  await expect(group).toHaveCount(1, { timeout: 10000 })
  const toggle = page.getByTestId('bookmark-group-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByTestId('bookmark-card')).toHaveCount(0)
  // Last-read summary line is the information scent while collapsed.
  await expect(page.getByTestId('bookmark-group-summary')).toContainText('Đang đọc: Phẩm Phương Tiện')
  await expect(page.getByTestId('bookmark-group-summary')).toContainText('1 dấu khác')

  // --- Expand via the chevron ---
  await toggle.tap()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('bookmark-card')).toHaveCount(2)
  await expect(page.getByTestId('bookmark-group-summary')).toHaveCount(0)

  // --- Persists across a full reload ---
  await page.reload()
  await routeAll(page)
  await expect(page.getByTestId('bookmark-group')).toHaveCount(1, { timeout: 10000 })
  await expect(page.getByTestId('bookmark-group-toggle')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('bookmark-card')).toHaveCount(2)
})

test('the cover/title header still navigates to the reader (collapse does not hijack it)', async ({ page }) => {
  test.setTimeout(60000)
  await routeAll(page)

  await page.goto('/')
  await expect(page.locator('#root')).toBeAttached()
  await page.waitForTimeout(500)
  await seedLocalforage(page, 'bookmarks', SEED_BOOKMARKS)
  await seedLocalforage(page, 'bookmark_group_state', [])

  await page.goto('/bookmarks')
  await routeAll(page)
  await expect(page.getByTestId('bookmark-group-header')).toHaveCount(1, { timeout: 10000 })

  // Tapping the cover/title (the Link, not the chevron) leaves the bookmarks page for the reader.
  await page.getByTestId('bookmark-group-header').tap()
  await expect(page).toHaveURL(new RegExp(`/read/${BOOK_ID}`), { timeout: 10000 })
})
