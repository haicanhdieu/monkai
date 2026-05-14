/**
 * Debug/regression test: investigate the bookmark navigation bug.
 *
 * Bug: bookmark shows "Trang 8 / 11" but reader opens at "Trang 4 / 11"
 *
 * Run:
 *   PLAYWRIGHT_TEST_BASE_URL=http://localhost:5173 npx playwright test e2e/bookmark-nav-debug.spec.ts --reporter=line --project=mobile-chrome
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
    const consoleLogs: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.text().startsWith('[')) {
        consoleLogs.push(`[browser ${msg.type()}] ${msg.text()}`)
      }
    })
    page.on('pageerror', (err) => consoleLogs.push(`[pageerror] ${err.message}`))

    await routeBookData(page)
    await page.goto(`/read/${BOOK_ID}`)

    const liveRegion = page.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(liveRegion).not.toBeEmpty({ timeout: 25000 })

    const initialText = await liveRegion.textContent()
    const totalMatch = initialText?.match(/\/\s*(\d+)/)
    const totalPages = totalMatch ? parseInt(totalMatch[1]) : 0
    console.log('[S1] Total pages:', totalPages)
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
    console.log(`[S2] At page ${manualPage}, CFI:`, manualCfi)
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
    console.log(`[S3] Went back to page ${autoPage}, auto CFI:`, autoCfi)
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
    console.log('[S4] Wrote bookmarks: auto(page', autoPage, ') manual(page', manualPage, ')')

    // — PART A: Group header should open at autoPage (auto bookmark = last read) —
    await page.goto('/')
    await routeBookData(page)
    await page.goto('/bookmarks')
    await routeBookData(page)
    await page.waitForTimeout(1500)

    const allCards = await page.getByTestId('bookmark-card').all()
    console.log('[S5A] Bookmark cards:', allCards.length)
    for (const c of allCards) console.log('  Card:', (await c.textContent())?.trim())

    const groupHeader = page.getByTestId('bookmark-group-header')
    await expect(groupHeader).toBeVisible({ timeout: 5000 })
    await groupHeader.click()
    await routeBookData(page)
    await expect(page.getByTestId('epub-container')).toBeVisible({ timeout: 25000 })
    const readerLiveA = page.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(readerLiveA).not.toBeEmpty({ timeout: 20000 })
    await page.waitForTimeout(3000)

    const finalTextA = await readerLiveA.textContent()
    console.log('[S5A] Group header → reader shows:', finalTextA)
    // Group header uses headerBookmark = most recently updated bookmark by timestamp.
    // Manual (timestamp=now) is newer than auto (timestamp=now-1s), so header opens at manualPage.
    expect(finalTextA).toContain(`Trang ${manualPage}`)

    // — PART B: Bookmark card click should open at manualPage —
    await page.goto('/')
    await routeBookData(page)
    await page.goto('/bookmarks')
    await routeBookData(page)
    await page.waitForTimeout(1500)

    // Click the MANUAL bookmark card via element.click() to avoid swipe-handler interference
    // element.click() dispatches a trusted click without pointer events (didSwipeRef stays false)
    const cardLinkHref = await page.evaluate(() => {
      const manualCard = [...document.querySelectorAll('[data-testid="bookmark-card"]')]
        .find(el => el.textContent?.includes('🔖') || el.querySelector('path[fill]'))
      const link = (manualCard ?? document.querySelector('[data-testid="bookmark-card"]'))?.querySelector('a')
      return link?.getAttribute('href') ?? null
    })
    console.log('[S5B] Manual bookmark card link href:', cardLinkHref)

    // Navigate to the reader with the manual bookmark's CFI via the Link's state
    // We use page.evaluate to call link.click() (no pointer events → didSwipeRef stays false)
    const navigated = await page.evaluate(({ manualPageNum, totalPagesNum }: { manualPageNum: number; totalPagesNum: number }) => {
      // Find the bookmark card showing the manual page number
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
    console.log('[S5B] Navigated from manual bookmark card:', navigated)

    await routeBookData(page)
    await expect(page.getByTestId('epub-container')).toBeVisible({ timeout: 25000 })
    const readerLiveB = page.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(readerLiveB).not.toBeEmpty({ timeout: 20000 })
    await page.waitForTimeout(3000)

    const finalTextB = await readerLiveB.textContent()
    console.log('[S5B] Manual bookmark card → reader shows:', finalTextB)

    if (consoleLogs.length > 0) {
      console.log('[S5B] Browser console:', consoleLogs.slice(-10).join('\n'))
    }

    // THE KEY ASSERTION: clicking the manual bookmark card should open at manualPage
    expect(finalTextB).toContain(`Trang ${manualPage}`)
  })

  test('opening reader from a bookmark shows the bookmarked page', async ({ page }) => {
    // Capture browser console for debugging
    const consoleLogs: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' || msg.text().includes('[')) {
        consoleLogs.push(`[browser ${msg.type()}] ${msg.text()}`)
      }
    })
    page.on('pageerror', (err) => consoleLogs.push(`[pageerror] ${err.message}`))

    await routeBookData(page)
    await page.goto(`/read/${BOOK_ID}`)

    // Wait for epub to load
    const liveRegion = page.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(liveRegion).not.toBeEmpty({ timeout: 25000 })

    const initialText = await liveRegion.textContent()
    console.log('[T1] Initial location:', initialText)
    expect(initialText).toMatch(/Trang 1 \//i)

    const totalMatch = initialText?.match(/\/\s*(\d+)/)
    const totalPages = totalMatch ? parseInt(totalMatch[1]) : 0
    console.log('[T1] Total pages in chapter:', totalPages)
    expect(totalPages).toBeGreaterThanOrEqual(5)

    // Navigate to a mid-chapter page (roughly 60%, max page 8)
    const targetPage = Math.min(Math.floor(totalPages * 0.6), 8)
    const tapNext = page.getByTestId('tap-next')

    for (let i = 0; i < targetPage - 1; i++) {
      await tapNext.click()
      await page.waitForTimeout(250)
    }

    await expect(liveRegion).toContainText(`Trang ${targetPage}`, { timeout: 8000 })
    const pageAtBookmark = (await liveRegion.textContent()) ?? ''
    console.log(`[T2] At page ${targetPage}:`, pageAtBookmark)

    // Dump console logs so far
    if (consoleLogs.length > 0) {
      console.log('[T2] Browser console logs:', consoleLogs.join('\n'))
    }

    // Wait for LAST_READ_POSITION to be written to localforage (written synchronously in relocated handler)
    await page.waitForTimeout(1000)

    // Debug: list all IndexedDB databases
    const dbList = await page.evaluate(async () => {
      try {
        const dbs = await indexedDB.databases()
        const result: Record<string, unknown> = { dbList: dbs.map(d => ({ name: d.name, version: d.version })) }
        // Try opening the localforage db
        const openResult = await new Promise<Record<string, unknown>>((res) => {
          const req = indexedDB.open('localforage')
          req.onsuccess = e => {
            const db = (e.target as IDBOpenDBRequest).result
            const storeInfo: Record<string, unknown> = {}
            const storeNames = [...db.objectStoreNames]
            let pending = storeNames.length
            if (pending === 0) { db.close(); res({ version: db.version, stores: storeNames, storeInfo }); return }
            for (const sn of storeNames) {
              const tx = db.transaction(sn, 'readonly')
              const store = tx.objectStore(sn)
              const kr = store.getAllKeys()
              kr.onsuccess = () => {
                storeInfo[sn] = kr.result
                if (--pending === 0) { db.close(); res({ version: db.version, stores: storeNames, storeInfo }) }
              }
              kr.onerror = () => { storeInfo[sn] = 'error'; if (--pending === 0) { db.close(); res({ version: db.version, stores: storeNames, storeInfo }) } }
            }
          }
          req.onerror = e => res({ error: String((e.target as IDBOpenDBRequest).error) })
          req.onblocked = () => res({ blocked: true })
        })
        result['openResult'] = openResult
        return result
      } catch(e) {
        return { caught: String(e) }
      }
    })
    console.log('[T2] IndexedDB diagnostic:', JSON.stringify(dbList, null, 2))

    // Read the CFI from LAST_READ_POSITION to construct the bookmark
    const stateBeforeSave = await readLocalforage(page)
    console.log('[T2] All localforage keys:', Object.keys(stateBeforeSave))
    console.log('[T2] LAST_READ_POSITION:', JSON.stringify(stateBeforeSave['last_read_position']))
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
    console.log('[T3] Wrote manual bookmark to localforage at CFI:', bookmarkCfi, 'page:', bookmarkPage)

    // Verify it was written
    const stateAfterSave = await readLocalforage(page)
    console.log('[T3] bookmarks in storage:', JSON.stringify(stateAfterSave['bookmarks'], null, 2))

    // Navigate away (go to home page, simulating user leaving the reader)
    await page.goto('/')
    await routeBookData(page)
    await page.waitForTimeout(500)

    // Navigate to bookmarks page — the app re-hydrates Zustand stores from localforage on mount
    await page.goto('/bookmarks')
    await routeBookData(page)
    await page.waitForTimeout(1500) // allow hydration + catalog load

    // Verify bookmark card shows our target page
    const allCards = await page.getByTestId('bookmark-card').all()
    console.log('[T4] Number of bookmark cards:', allCards.length)

    for (const c of allCards) {
      console.log('[T4] Card:', (await c.textContent())?.trim())
    }

    // Find the bookmark card with matching page text
    const bmCard = page.getByTestId('bookmark-card')
      .filter({ hasText: new RegExp(`Trang ${targetPage}\\s*/`) })
      .first()
    await expect(bmCard).toBeVisible({ timeout: 5000 })
    const cardText = await bmCard.textContent()
    console.log('[T4] Bookmark card text:', cardText?.trim())

    // Get the link href for logging
    const linkHref = await bmCard.locator('a').getAttribute('href')
    console.log('[T4] Link href:', linkHref)

    // Click the bookmark-group-header Link to navigate with CFI in route state.
    // This is the ACTUAL bug path: the header Link passes state:{cfi} so the reader
    // opens with initialCfi set — and should land at the bookmarked page.
    // (We avoid clicking the BookmarkCard <a> which has swipe pointer-event handlers
    // that interfere with Playwright's synthetic mouse events.)
    const groupHeader = page.getByTestId('bookmark-group-header')
    await expect(groupHeader).toBeVisible({ timeout: 3000 })
    await groupHeader.click()
    console.log('[T4] URL after group-header click:', page.url())
    await routeBookData(page)

    // Wait for reader to fully load and navigate to bookmark position
    await expect(page.getByTestId('epub-container')).toBeVisible({ timeout: 25000 })

    const readerLive = page.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(readerLive).not.toBeEmpty({ timeout: 20000 })

    // Wait for the resume navigation to complete (may involve two epub.js display() calls)
    await page.waitForTimeout(3000)

    const finalText = await readerLive.textContent()
    console.log('[T5] Reader shows after bookmark click:', finalText)

    // Dump localforage state after opening from bookmark
    const stateAfterOpen = await readLocalforage(page)
    console.log('[T5] bookmarks after open:', JSON.stringify(stateAfterOpen['bookmarks'], null, 2))
    console.log('[T5] last_read_position after open:', JSON.stringify(stateAfterOpen['last_read_position'], null, 2))

    // THE KEY ASSERTION: reader should show the SAME page as the bookmark
    expect(finalText).toContain(`Trang ${targetPage}`)
  })
})
