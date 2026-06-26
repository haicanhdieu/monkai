/**
 * Regression: a bookmark must open the reader at the bookmarked page.
 *
 * Original bug: a bookmark showed "Trang 8 / 11" but tapping it opened the reader at
 * "Trang 4 / 11". These tests drive the real page → CFI → resume path and assert the
 * reader lands on the same page the bookmark advertised.
 *
 * Run:
 *   PLAYWRIGHT_TEST_BASE_URL=http://localhost:5173 npx playwright test e2e/bookmark-nav.spec.ts --reporter=line --project=mobile-chrome
 */

import { test, expect } from '@playwright/test'

// Must be a UUID so isValidBookId() in useStorageHydration passes
const BOOK_ID = '00000000-1111-2222-3333-444444444444'
const BOOK_JSON_PATH = `mock/${BOOK_ID}.json`

// Generate ~4000 chars per page × 11 = 44,000 chars total for 11 pages at 390×844
const makeLongContent = () => {
  const parts: string[] = []
  for (let i = 1; i <= 120; i++) {
    parts.push(`Câu ${i}: Nam Mô A Di Đà Phật, đây là nội dung của câu số ${i} trong chương kinh để kiểm tra phân trang của ứng dụng đọc kinh.`)
  }
  return parts.join(' ')
}

const CATALOG = {
  _meta: { schema_version: '1.0', built_at: '2026-01-01T00:00:00.000Z', total_books: 1 },
  books: [
    {
      id: BOOK_ID,
      source_book_id: 'mock',
      book_name: 'Bookmark Nav Test',
      book_seo_name: 'bookmark-nav-test',
      cover_image_url: null,
      author: 'Test',
      publisher: null,
      publication_year: 2026,
      category_id: 1,
      category_name: 'Kinh',
      category_seo_name: 'kinh',
      total_chapters: 1,
      artifacts: [
        { source: 'mock', format: 'json', path: BOOK_JSON_PATH, built_at: '2026-01-01T00:00:00.000Z' },
      ],
    },
  ],
}

const BOOK_DATA = {
  id: BOOK_ID,
  book_name: 'Bookmark Nav Test',
  category_name: 'Kinh',
  category_seo_name: 'kinh',
  author: 'Test',
  chapters: [
    {
      chapter_name: 'Lời nói đầu',
      pages: [{ html_content: `<p>${makeLongContent()}</p>` }],
    },
  ],
}

async function routeBookData(page: import('@playwright/test').Page) {
  await page.route('**/book-data/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG) }),
  )
  // Route all source-prefixed catalog paths
  await page.route('**/book-data/*/index.json', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG) }),
  )
  await page.route(`**/${BOOK_JSON_PATH}`, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOOK_DATA) }),
  )
}

/** Read all key/value pairs from localforage (IndexedDB).
 *  localforage 1.x uses DB name="localforage", version=2, store name="keyvaluepairs".
 */
async function readLocalforage(page: import('@playwright/test').Page): Promise<Record<string, unknown>> {
  return page.evaluate(
    () =>
      new Promise<Record<string, unknown>>((resolve) => {
        const result: Record<string, unknown> = {}
        const req = indexedDB.open('localforage')
        req.onsuccess = (e) => {
          const db = (e.target as IDBOpenDBRequest).result
          // localforage 1.x uses 'keyvaluepairs' as the object store name
          const storeName = db.objectStoreNames.contains('keyvaluepairs')
            ? 'keyvaluepairs'
            : db.objectStoreNames.contains('localforage')
              ? 'localforage'
              : null
          if (!storeName) { db.close(); resolve(result); return }
          const tx = db.transaction(storeName, 'readonly')
          const store = tx.objectStore(storeName)
          const keysReq = store.getAllKeys()
          keysReq.onsuccess = () => {
            const keys = keysReq.result as string[]
            let rem = keys.length
            if (rem === 0) { db.close(); resolve(result); return }
            for (const k of keys) {
              const getReq = store.get(k)
              getReq.onsuccess = () => {
                result[k as string] = getReq.result
                if (--rem === 0) { db.close(); resolve(result) }
              }
              getReq.onerror = () => { if (--rem === 0) { db.close(); resolve(result) } }
            }
          }
          keysReq.onerror = () => { db.close(); resolve(result) }
        }
        req.onerror = () => resolve(result)
        req.onblocked = () => resolve(result)
      }),
  )
}

/** Write a value to localforage (IndexedDB). localforage 1.x uses store name "keyvaluepairs". */
async function writeLocalforage(page: import('@playwright/test').Page, key: string, value: unknown) {
  await page.evaluate(
    ({ key, value }: { key: string; value: unknown }) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('localforage')
        req.onsuccess = (e) => {
          const db = (e.target as IDBOpenDBRequest).result
          const storeName = db.objectStoreNames.contains('keyvaluepairs')
            ? 'keyvaluepairs'
            : db.objectStoreNames.contains('localforage')
              ? 'localforage'
              : null
          if (!storeName) { db.close(); reject(new Error('store not found')); return }
          const tx = db.transaction(storeName, 'readwrite')
          const store = tx.objectStore(storeName)
          const putReq = store.put(value, key)
          putReq.onsuccess = () => { db.close(); resolve() }
          putReq.onerror = () => { db.close(); reject(new Error('put failed')) }
          tx.onerror = () => { db.close(); reject(new Error('transaction failed')) }
        }
        req.onerror = () => reject(new Error('open failed'))
        req.onblocked = () => reject(new Error('open blocked'))
      }),
    { key, value },
  )
}

test.describe('Bookmark navigation round-trip', () => {
  test.setTimeout(90000)

  /**
   * Scenario: user saved a manual bookmark at page 6, but the auto bookmark (last read) is at
   * page 3 because they navigated back. Manual bookmark has a newer timestamp.
   * This tests:
   *   A) Group header → headerBookmark = most recent by timestamp = manual (page 6)
   *   B) Manual bookmark card (bookmark.cfi at page 6) → reader shows page 6
   */
  test('auto bookmark vs manual bookmark navigation', async ({ page }) => {
    await routeBookData(page)
    await page.goto(`/read/${BOOK_ID}`)

    const liveRegion = page.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(liveRegion).not.toBeEmpty({ timeout: 25000 })

    const initialText = await liveRegion.textContent()
    const totalMatch = initialText?.match(/\/\s*(\d+)/)
    const totalPages = totalMatch ? parseInt(totalMatch[1]) : 0
    expect(totalPages).toBeGreaterThanOrEqual(5)

    const tapNext = page.getByTestId('tap-next')
    const tapPrev = page.getByTestId('tap-prev')

    // Navigate to page 6 (the "manual bookmark" target page)
    const manualPage = Math.min(Math.floor(totalPages * 0.6), 8)
    for (let i = 0; i < manualPage - 1; i++) {
      await tapNext.click()
      await page.waitForTimeout(200)
    }
    await expect(liveRegion).toContainText(`Trang ${manualPage}`, { timeout: 8000 })
    await page.waitForTimeout(500)

    const stateAtManualPage = await readLocalforage(page)
    const manualLastRead = stateAtManualPage['last_read_position'] as { cfi?: string; page?: number } | null
    const manualCfi = manualLastRead?.cfi!
    expect(manualCfi).toBeTruthy()

    // Navigate BACK 3 pages (simulating user going back, updating the auto bookmark)
    const autoPagesBack = Math.min(3, manualPage - 1)
    const autoPage = manualPage - autoPagesBack
    for (let i = 0; i < autoPagesBack; i++) {
      await tapPrev.click()
      await page.waitForTimeout(200)
    }
    await expect(liveRegion).toContainText(`Trang ${autoPage}`, { timeout: 8000 })
    await page.waitForTimeout(1000) // wait for auto bookmark debounce (300ms)

    const stateAtAutoPage = await readLocalforage(page)
    const autoLastRead = stateAtAutoPage['last_read_position'] as { cfi?: string; page?: number } | null
    const autoCfi = autoLastRead?.cfi!
    expect(autoCfi).toBeTruthy()
    expect(autoLastRead?.page).toBe(autoPage)

    // Write bookmarks: auto at page autoPage, manual at page manualPage
    const bookmarks = [
      {
        bookId: BOOK_ID, bookTitle: 'Bookmark Nav Test', cfi: autoCfi,
        type: 'auto', timestamp: Date.now() - 1000, page: autoPage, total: totalPages,
        chapterTitle: 'Lời nói đầu',
      },
      {
        bookId: BOOK_ID, bookTitle: 'Bookmark Nav Test', cfi: manualCfi,
        type: 'manual', timestamp: Date.now(), page: manualPage, total: totalPages,
        chapterTitle: 'Lời nói đầu',
      },
    ]
    await writeLocalforage(page, 'bookmarks', bookmarks)

    // — PART A: Group header opens at the most-recent bookmark (manual, page manualPage) —
    await page.goto('/')
    await routeBookData(page)
    await page.goto('/bookmarks')
    await routeBookData(page)
    await page.waitForTimeout(1500)

    const groupHeader = page.getByTestId('bookmark-group-header')
    await expect(groupHeader).toBeVisible({ timeout: 5000 })
    await groupHeader.click()
    await routeBookData(page)
    await expect(page.getByTestId('epub-container')).toBeVisible({ timeout: 25000 })
    const readerLiveA = page.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(readerLiveA).not.toBeEmpty({ timeout: 20000 })
    await page.waitForTimeout(3000)

    const finalTextA = await readerLiveA.textContent()
    // Group header uses headerBookmark = most recently updated bookmark by timestamp.
    // Manual (timestamp=now) is newer than auto (timestamp=now-1s), so header opens at manualPage.
    expect(finalTextA).toContain(`Trang ${manualPage}`)

    // — PART B: Manual bookmark card click should open at manualPage —
    await page.goto('/')
    await routeBookData(page)
    await page.goto('/bookmarks')
    await routeBookData(page)
    await page.waitForTimeout(1500)

    // Groups are collapsed by default — expand so the bookmark cards render.
    await page.getByTestId('bookmark-group-toggle').first().click()
    await expect(page.getByTestId('bookmark-card').first()).toBeVisible({ timeout: 5000 })

    // Click the manual bookmark card via element.click() (no pointer events → the swipe-to-delete
    // handler's didSwipeRef stays false, unlike Playwright's synthetic mouse events).
    const navigated = await page.evaluate(({ manualPageNum, totalPagesNum }: { manualPageNum: number; totalPagesNum: number }) => {
      const allCards = document.querySelectorAll('[data-testid="bookmark-card"]')
      for (const card of allCards) {
        const text = card.textContent ?? ''
        if (text.includes(`Trang ${manualPageNum} / ${totalPagesNum}`)) {
          const link = card.querySelector('a') as HTMLAnchorElement | null
          if (link) {
            link.click()
            return true
          }
        }
      }
      return false
    }, { manualPageNum: manualPage, totalPagesNum: totalPages })
    expect(navigated).toBe(true)

    await routeBookData(page)
    await expect(page.getByTestId('epub-container')).toBeVisible({ timeout: 25000 })
    const readerLiveB = page.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(readerLiveB).not.toBeEmpty({ timeout: 20000 })
    await page.waitForTimeout(3000)

    const finalTextB = await readerLiveB.textContent()
    // THE KEY ASSERTION: clicking the manual bookmark card should open at manualPage
    expect(finalTextB).toContain(`Trang ${manualPage}`)
  })

  test('opening reader from a bookmark shows the bookmarked page', async ({ page }) => {
    await routeBookData(page)
    await page.goto(`/read/${BOOK_ID}`)

    // Wait for epub to load
    const liveRegion = page.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(liveRegion).not.toBeEmpty({ timeout: 25000 })

    const initialText = await liveRegion.textContent()
    expect(initialText).toMatch(/Trang 1 \//i)

    const totalMatch = initialText?.match(/\/\s*(\d+)/)
    const totalPages = totalMatch ? parseInt(totalMatch[1]) : 0
    expect(totalPages).toBeGreaterThanOrEqual(5)

    // Navigate to a mid-chapter page (roughly 60%, max page 8)
    const targetPage = Math.min(Math.floor(totalPages * 0.6), 8)
    const tapNext = page.getByTestId('tap-next')

    for (let i = 0; i < targetPage - 1; i++) {
      await tapNext.click()
      await page.waitForTimeout(250)
    }

    await expect(liveRegion).toContainText(`Trang ${targetPage}`, { timeout: 8000 })

    // Wait for LAST_READ_POSITION to be written to localforage (written in the relocated handler)
    await page.waitForTimeout(1000)

    // Read the CFI from LAST_READ_POSITION to construct the bookmark
    const stateBeforeSave = await readLocalforage(page)
    const lastRead = stateBeforeSave['last_read_position'] as {
      bookId?: string; cfi?: string; page?: number; total?: number; chapterTitle?: string
    } | null

    expect(lastRead).toBeTruthy()
    expect(lastRead?.cfi).toBeTruthy()
    expect(lastRead?.page).toBe(targetPage)

    const bookmarkCfi = lastRead!.cfi!
    const bookmarkPage = lastRead!.page!

    // Write a manual bookmark directly to localforage (bypasses chrome timing issues)
    const manualBookmark = [{
      bookId: BOOK_ID,
      bookTitle: 'Bookmark Nav Test',
      cfi: bookmarkCfi,
      timestamp: Date.now(),
      type: 'manual',
      page: bookmarkPage,
      total: totalPages,
      chapterTitle: lastRead?.chapterTitle ?? 'Lời nói đầu',
    }]
    await writeLocalforage(page, 'bookmarks', manualBookmark)

    // Navigate away (go to home page, simulating user leaving the reader)
    await page.goto('/')
    await routeBookData(page)
    await page.waitForTimeout(500)

    // Navigate to bookmarks page — the app re-hydrates Zustand stores from localforage on mount
    await page.goto('/bookmarks')
    await routeBookData(page)
    await page.waitForTimeout(1500) // allow hydration + catalog load

    // Groups are collapsed by default — expand so the bookmark cards render.
    await page.getByTestId('bookmark-group-toggle').first().click()
    await expect(page.getByTestId('bookmark-card').first()).toBeVisible({ timeout: 5000 })

    // The bookmark card with our target page must be present.
    const bmCard = page.getByTestId('bookmark-card')
      .filter({ hasText: new RegExp(`Trang ${targetPage}\\s*/`) })
      .first()
    await expect(bmCard).toBeVisible({ timeout: 5000 })

    // Click the bookmark-group-header Link to navigate with CFI in route state.
    // This is the ACTUAL bug path: the header Link passes state:{cfi} so the reader
    // opens with initialCfi set — and should land at the bookmarked page.
    // (We avoid clicking the BookmarkCard <a> which has swipe pointer-event handlers
    // that interfere with Playwright's synthetic mouse events.)
    const groupHeader = page.getByTestId('bookmark-group-header')
    await expect(groupHeader).toBeVisible({ timeout: 3000 })
    await groupHeader.click()
    await routeBookData(page)

    // Wait for reader to fully load and navigate to bookmark position
    await expect(page.getByTestId('epub-container')).toBeVisible({ timeout: 25000 })

    const readerLive = page.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(readerLive).not.toBeEmpty({ timeout: 20000 })

    // Wait for the resume navigation to complete (may involve two epub.js display() calls)
    await page.waitForTimeout(3000)

    const finalText = await readerLive.textContent()
    // THE KEY ASSERTION: reader should show the SAME page as the bookmark
    expect(finalText).toContain(`Trang ${targetPage}`)
  })
})
