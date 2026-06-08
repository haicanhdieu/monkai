import { test, expect } from '@playwright/test'

// Block the service worker so page.route() intercepts all catalog fetches.
// Without this the SW's sub-fetch bypasses page-level route mocks.
test.use({ serviceWorkers: 'block' })

// --------------------------------------------------------------------------
// Catalog mock helpers
// --------------------------------------------------------------------------

function makeBook(i: number, title: string, author = 'Test Author') {
  return {
    id: `search-restore-book-${i}`,
    book_name: title,
    book_seo_name: title.toLowerCase().replace(/\s+/g, '-'),
    author,
    category_name: 'Kinh',
    category_seo_name: 'kinh',
    cover_image_url: null,
    artifacts: [],
    source: 'vbeta',
  }
}

// 3 books is enough to verify query restore; all titles contain "Bát Nhã" for search matching.
const SMALL_CATALOG = {
  books: [
    makeBook(1, 'Kinh Bát Nhã Ba La Mật'),
    makeBook(2, 'Bát Nhã Tâm Kinh'),
    makeBook(3, 'Kim Cương Bát Nhã'),
  ],
}

// 30 books with "Kinh" in the title → enough results to scroll the virtual list.
const LARGE_CATALOG = {
  books: Array.from({ length: 30 }, (_, i) =>
    makeBook(i + 1, `Kinh Sách Số ${i + 1}`, `Tác Giả ${i + 1}`),
  ),
}

async function mockCatalog(page: Parameters<typeof test.beforeEach>[0]['page'], catalog: object) {
  const body = JSON.stringify(catalog)
  // Use a regex so the route matches regardless of host (localhost, OneDrive tunnel, etc.)
  // Matches URLs containing book-data/<source>/index.json anywhere in the path or query
  await page.route(/book-data\/[^/]+\/index\.json/, (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body }),
  )
}

// --------------------------------------------------------------------------
// Tests
// --------------------------------------------------------------------------

test.describe('Library search state restore on back navigation', () => {
  test('restores search query after navigating to a book and pressing back', async ({ page }) => {
    await mockCatalog(page, SMALL_CATALOG)
    await page.goto('/library')

    // Wait for catalog to load (category grid visible)
    await expect(page.getByLabel('Danh mục thể loại')).toBeVisible({ timeout: 10000 })

    // Type search query
    const searchInput = page.getByLabel('Tìm kiếm kinh điển...')
    await searchInput.fill('Bát Nhã')

    // Wait for search results
    await expect(page.getByText('Kết quả tìm kiếm')).toBeVisible({ timeout: 5000 })
    const firstResult = page.getByRole('link', { name: /Kinh Bát Nhã Ba La Mật/ })
    await expect(firstResult).toBeVisible()

    // Navigate to the book
    await firstResult.click()
    await expect(page).toHaveURL(/\/read\/search-restore-book-1/, { timeout: 5000 })

    // Press browser back — same effect as the chrome-back button (both call navigate(-1))
    await page.goBack()
    await expect(page).toHaveURL(/\/library/, { timeout: 5000 })

    // Search bar must still show the original query
    await expect(searchInput).toHaveValue('Bát Nhã')

    // Search results must be visible without re-typing
    await expect(page.getByText('Kết quả tìm kiếm')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('link', { name: /Kinh Bát Nhã Ba La Mật/ })).toBeVisible()
  })

  test('clears search state when user explicitly clears the search bar', async ({ page }) => {
    await mockCatalog(page, SMALL_CATALOG)
    await page.goto('/library')

    await expect(page.getByLabel('Danh mục thể loại')).toBeVisible({ timeout: 10000 })

    const searchInput = page.getByLabel('Tìm kiếm kinh điển...')
    await searchInput.fill('Bát Nhã')
    await expect(page.getByText('Kết quả tìm kiếm')).toBeVisible({ timeout: 5000 })

    // Clear via the ✕ button
    await page.getByRole('button', { name: 'Xóa từ khóa' }).click()
    await expect(searchInput).toHaveValue('')

    // Navigate away then back
    await page.getByRole('link', { name: /Bát Nhã Tâm Kinh/ }).waitFor({ state: 'detached', timeout: 3000 }).catch(() => null)
    await page.goto('/library')

    // Category grid — not search results — must be shown
    await expect(page.getByLabel('Danh mục thể loại')).toBeVisible({ timeout: 10000 })
    await expect(page.getByText('Kết quả tìm kiếm')).not.toBeVisible()
    await expect(searchInput).toHaveValue('')
  })

  test('restores scroll position after navigating to a book and pressing back', async ({ page }) => {
    await mockCatalog(page, LARGE_CATALOG)
    await page.goto('/library')

    await expect(page.getByLabel('Danh mục thể loại')).toBeVisible({ timeout: 10000 })

    // Search term that matches all 30 books
    const searchInput = page.getByLabel('Tìm kiếm kinh điển...')
    await searchInput.fill('Kinh')

    // Wait for the virtual list to render results
    await expect(page.getByText('Kết quả tìm kiếm')).toBeVisible({ timeout: 5000 })
    await expect(page.getByRole('link', { name: /Kinh Sách Số/ }).first()).toBeVisible({ timeout: 5000 })

    // Scroll the main container partway down
    const mainEl = page.locator('main')
    await mainEl.evaluate((el) => el.scrollTo({ top: 400 }))

    // Wait for virtualizer to settle at the new scroll position
    await page.waitForTimeout(200)

    const scrollBefore = await mainEl.evaluate((el) => el.scrollTop)
    expect(scrollBefore).toBeGreaterThan(300)

    // Find the center coordinates of a link that is FULLY visible in the viewport.
    // We use page.mouse.click(x, y) instead of locator.click() to bypass Playwright's
    // automatic scroll-into-view, which would reset main.scrollTop to 0 and cause the
    // pointerdown save listener to record the wrong scroll position.
    const clickCoords = await page.evaluate(() => {
      const main = document.querySelector('main')!
      // The AppBar is sticky with z-20; links behind it can't be tapped.
      // Find its bottom edge so we only pick links below it.
      const stickyEl = main.querySelector('.sticky')
      const stickyBottom = stickyEl ? stickyEl.getBoundingClientRect().bottom : 130

      const links = Array.from(document.querySelectorAll('a[href*="/read/"]')) as HTMLAnchorElement[]
      for (const link of links) {
        const rect = link.getBoundingClientRect()
        if (rect.top >= stickyBottom && rect.bottom <= window.innerHeight && rect.height > 0) {
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
        }
      }
      return null
    })
    expect(clickCoords).not.toBeNull()
    // touchscreen.tap dispatches pointerdown (captured by our save listener) then click
    await page.touchscreen.tap(clickCoords!.x, clickCoords!.y)
    await expect(page).toHaveURL(/\/read\/search-restore-book-/, { timeout: 5000 })

    // Press back — fires popstate, which resets scroll guard and triggers restoration
    await page.goBack()
    await expect(page).toHaveURL(/\/library/, { timeout: 5000 })

    // Query must be restored before we check scroll
    await expect(searchInput).toHaveValue('Kinh')
    await expect(page.getByText('Kết quả tìm kiếm')).toBeVisible({ timeout: 5000 })

    // Allow rAF cycle for scroll restoration
    await page.waitForTimeout(200)

    const scrollAfter = await mainEl.evaluate((el) => el.scrollTop)
    // Scroll position within ±120px (one virtual item height ≈ 116px)
    expect(scrollAfter).toBeGreaterThan(scrollBefore - 120)
    expect(scrollAfter).toBeLessThan(scrollBefore + 120)
  })
})
