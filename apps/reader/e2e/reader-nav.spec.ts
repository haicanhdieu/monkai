import { test, expect } from '@playwright/test'

const BOOK_ID = 'reader-nav-test-book'
const BOOK_JSON_PATH = 'mock/reader-nav-test-book.json'

// Enough text to produce at least 2 pages on a 390x844 viewport
const LONG_CONTENT = 'Namo Amitabha Buddha. '.repeat(600).trim()

const CATALOG = {
  _meta: { schema_version: '1.0', built_at: '2026-03-14T00:00:00.000Z', total_books: 1 },
  books: [
    {
      id: BOOK_ID,
      source_book_id: 'mock',
      book_name: 'Reader Nav Test Book',
      book_seo_name: 'reader-nav-test-book',
      cover_image_url: null,
      author: 'Test',
      publisher: null,
      publication_year: 2026,
      category_id: 1,
      category_name: 'Kinh',
      category_seo_name: 'kinh',
      total_chapters: 1,
      artifacts: [
        { source: 'mock', format: 'json', path: BOOK_JSON_PATH, built_at: '2026-03-14T00:00:00.000Z' },
      ],
    },
  ],
}

const BOOK_DATA = {
  id: BOOK_ID,
  book_name: 'Reader Nav Test Book',
  category_name: 'Kinh',
  category_seo_name: 'kinh',
  author: 'Test',
  chapters: [{ pages: [{ html_content: `<p>${LONG_CONTENT}</p>` }] }],
}

test.describe('Reader tap navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/book-data/index.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG) }),
    )
    await page.route(`**/book-data/${BOOK_JSON_PATH}`, (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(BOOK_DATA) }),
    )
    await page.goto(`/read/${BOOK_ID}`)
  })

  test('tap-prev and tap-next zones are present once reader is ready', async ({ page }) => {
    // epub-container becomes visible when isReady=true
    await expect(page.getByTestId('epub-container')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('tap-prev')).toBeAttached()
    await expect(page.getByTestId('tap-next')).toBeAttached()
  })

  test('tapping right zone advances to next page and tapping left returns to previous page', async ({ page }) => {
    // Wait for epub.js to render and emit the first 'relocated' event, which populates the aria-live region
    const liveRegion = page.locator('[aria-live="polite"][aria-atomic="true"]')
    await expect(liveRegion).not.toBeEmpty({ timeout: 20000 })

    const initialText = await liveRegion.textContent()
    // Initial page must be page 1 (e.g. "Trang 1 / N")
    expect(initialText).toMatch(/1\s*\//)

    // Navigate forward — tap right zone
    await page.getByTestId('tap-next').click()

    // Wait for location to change to page 2
    await expect(liveRegion).toContainText('2', { timeout: 10000 })
    const afterNextText = await liveRegion.textContent()
    expect(afterNextText).toMatch(/2\s*\//)

    // Navigate backward — tap left zone
    await page.getByTestId('tap-prev').click()

    // Wait for location to return to page 1
    await expect(liveRegion).not.toContainText('2 /', { timeout: 10000 })
    const afterPrevText = await liveRegion.textContent()
    expect(afterPrevText).toMatch(/1\s*\//)
  })
})
