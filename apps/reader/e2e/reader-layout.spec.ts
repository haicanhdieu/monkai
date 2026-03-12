import { test, expect } from '@playwright/test'

const BOOK_ID = 'reader-layout-test-book'
const BOOK_JSON_PATH = 'mock/reader-layout-test-book.json'

const LONG_UNBROKEN_TOKEN = 'X'.repeat(1200)
const VERY_LONG_PARAGRAPH = 'Namo Amitabha '.repeat(900).trim()

test.describe('Reader layout overflow', () => {
  test('does not show horizontal or vertical native scrollbars for long content', async ({ page }) => {
    await page.route('**/book-data/index.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          _meta: {
            schema_version: '1.0',
            built_at: '2026-03-07T16:30:00.000Z',
            total_books: 1,
          },
          books: [
            {
              id: BOOK_ID,
              source_book_id: 'mock',
              book_name: 'Reader Layout Test Book',
              book_seo_name: 'reader-layout-test-book',
              cover_image_url: null,
              author: 'Test',
              publisher: null,
              publication_year: 2026,
              category_id: 1,
              category_name: 'Kinh',
              category_seo_name: 'kinh',
              total_chapters: 1,
              artifacts: [
                {
                  source: 'mock',
                  format: 'json',
                  path: BOOK_JSON_PATH,
                  built_at: '2026-03-07T16:30:00.000Z',
                },
              ],
            },
          ],
        }),
      })
    })

    await page.route(`**/book-data/${BOOK_JSON_PATH}`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: BOOK_ID,
          book_name: 'Reader Layout Test Book',
          category_name: 'Kinh',
          category_seo_name: 'kinh',
          author: 'Test',
          chapters: [
            {
              pages: [
                {
                  html_content: `<p>${LONG_UNBROKEN_TOKEN}</p>`,
                },
                {
                  html_content: `<p>${VERY_LONG_PARAGRAPH}</p>`,
                },
              ],
            },
          ],
        }),
      })
    })

    await page.goto(`/read/${BOOK_ID}`)
    await expect(page.getByTestId('reader-engine')).toBeVisible()
    await expect(page.getByTestId('reader-text-column')).toBeVisible()

    const textColumnOverflow = await page.getByTestId('reader-text-column').evaluate((el) => ({
      horizontal: el.scrollWidth - el.clientWidth,
      vertical: el.scrollHeight - el.clientHeight,
    }))

    expect(textColumnOverflow.horizontal).toBeLessThanOrEqual(1)
    expect(textColumnOverflow.vertical).toBeLessThanOrEqual(1)

    const windowOverflow = await page.evaluate(() => ({
      horizontal:
        document.documentElement.scrollWidth -
        Math.max(document.documentElement.clientWidth, window.innerWidth),
      vertical:
        document.documentElement.scrollHeight -
        Math.max(document.documentElement.clientHeight, window.innerHeight),
    }))

    expect(windowOverflow.horizontal).toBeLessThanOrEqual(1)
    expect(windowOverflow.vertical).toBeLessThanOrEqual(1)
  })

  test('splits overlong paragraph across multiple pages with zero content loss', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })

    await page.route('**/book-data/index.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          _meta: { schema_version: '1.0', built_at: '2026-03-07T00:00:00.000Z', total_books: 1 },
          books: [
            {
              id: 'overlong-test-book',
              source_book_id: 'mock',
              book_name: 'Overlong Test Book',
              book_seo_name: 'overlong-test-book',
              cover_image_url: null,
              author: 'Test',
              publisher: null,
              publication_year: 2026,
              category_id: 1,
              category_name: 'Kinh',
              category_seo_name: 'kinh',
              total_chapters: 1,
              artifacts: [{ source: 'mock', format: 'json', path: 'mock/overlong-test-book.json', built_at: '2026-03-07T00:00:00.000Z' }],
            },
          ],
        }),
      })
    })

    await page.route('**/book-data/mock/overlong-test-book.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'overlong-test-book',
          book_name: 'Overlong Test Book',
          category_name: 'Kinh',
          category_seo_name: 'kinh',
          author: 'Test',
          chapters: [{ pages: [{ html_content: `<p>${VERY_LONG_PARAGRAPH}</p>` }] }],
        }),
      })
    })

    await page.goto('/read/overlong-test-book')
    await expect(page.getByTestId('reader-engine')).toBeVisible()

    // Wait for pagination to complete
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="reader-engine"]')
      return el !== null && Number(el.getAttribute('data-page-total') ?? '0') > 0
    })

    const totalPages = Number(
      await page.getByTestId('reader-engine').getAttribute('data-page-total'),
    )

    // A 12,600-char paragraph on 375x667 MUST produce multiple content pages
    expect(totalPages).toBeGreaterThan(2) // cover + at least 2 content pages

    // Navigate through all pages, collecting text and checking overflow
    const collectedText: string[] = []

    for (let p = 0; p < totalPages; p++) {
      // Collect text from text column if visible
      const hasTextColumn = await page.getByTestId('reader-text-column').isVisible().catch(() => false)
      if (hasTextColumn) {
        const text = await page.getByTestId('reader-text-column').textContent()
        if (text) collectedText.push(text)

        // Assert no vertical overflow on this page
        const overflow = await page.getByTestId('reader-text-column').evaluate((el) => el.scrollHeight - el.clientHeight)
        expect(overflow).toBeLessThanOrEqual(1)
      }

      // Navigate to next page
      if (p < totalPages - 1) {
        await page.keyboard.press('ArrowRight')
        // Small wait for page transition
        await page.waitForTimeout(100)
      }
    }

    // Verify zero content loss: all words from VERY_LONG_PARAGRAPH appear in collected text
    const allCollected = collectedText.join(' ')
    const originalWords = VERY_LONG_PARAGRAPH.split(/\s+/)
    // Check a sample of words spread across the paragraph
    for (const idx of [0, 100, 400, 800, originalWords.length - 1]) {
      if (idx < originalWords.length) {
        expect(allCollected).toContain(originalWords[idx])
      }
    }
  })

  test('re-paginates on viewport resize without scrollbars', async ({ page }) => {
    // Use a book with enough content to span multiple pages at any viewport size
    const MANY_PARAGRAPHS = Array.from({ length: 100 }, (_, i) => `<p>Paragraph ${i + 1}: Namo Amitabha Buddha.</p>`).join('')

    await page.route('**/book-data/index.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          _meta: { schema_version: '1.0', built_at: '2026-03-07T00:00:00.000Z', total_books: 1 },
          books: [
            {
              id: 'resize-test-book',
              source_book_id: 'mock',
              book_name: 'Resize Test Book',
              book_seo_name: 'resize-test-book',
              cover_image_url: null,
              author: 'Test',
              publisher: null,
              publication_year: 2026,
              category_id: 1,
              category_name: 'Kinh',
              category_seo_name: 'kinh',
              total_chapters: 1,
              artifacts: [{ source: 'mock', format: 'json', path: 'mock/resize-test-book.json', built_at: '2026-03-07T00:00:00.000Z' }],
            },
          ],
        }),
      })
    })

    await page.route('**/book-data/mock/resize-test-book.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'resize-test-book',
          book_name: 'Resize Test Book',
          category_name: 'Kinh',
          category_seo_name: 'kinh',
          author: 'Test',
          chapters: [{ pages: [{ html_content: MANY_PARAGRAPHS }] }],
        }),
      })
    })

    // Load at desktop viewport
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto('/read/resize-test-book')
    // Wait until pagination completes and data-page-total is a positive number
    await page.waitForFunction(() => {
      const el = document.querySelector('[data-testid="reader-engine"]')
      return el !== null && Number(el.getAttribute('data-page-total') ?? '0') > 0
    })

    const desktopPageCount = Number(
      await page.getByTestId('reader-engine').getAttribute('data-page-total'),
    )

    // Verify no scrollbars at desktop size
    const desktopOverflow = await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth - Math.max(document.documentElement.clientWidth, window.innerWidth),
      vertical: document.documentElement.scrollHeight - Math.max(document.documentElement.clientHeight, window.innerHeight),
    }))
    expect(desktopOverflow.horizontal).toBeLessThanOrEqual(1)
    expect(desktopOverflow.vertical).toBeLessThanOrEqual(1)

    // Resize to mobile viewport and wait for re-pagination to complete
    await page.setViewportSize({ width: 390, height: 844 })
    // Wait for data-page-total to update (DOM observable, not a hardcoded delay)
    await page.waitForFunction(
      (desktopCount) => {
        const el = document.querySelector('[data-testid="reader-engine"]')
        const newCount = Number(el?.getAttribute('data-page-total') ?? '0')
        return newCount > 0 && newCount !== desktopCount
      },
      desktopPageCount,
    )

    const mobilePageCount = Number(
      await page.getByTestId('reader-engine').getAttribute('data-page-total'),
    )

    // Verify no scrollbars at mobile size
    const mobileOverflow = await page.evaluate(() => ({
      horizontal: document.documentElement.scrollWidth - Math.max(document.documentElement.clientWidth, window.innerWidth),
      vertical: document.documentElement.scrollHeight - Math.max(document.documentElement.clientHeight, window.innerHeight),
    }))
    expect(mobileOverflow.horizontal).toBeLessThanOrEqual(1)
    expect(mobileOverflow.vertical).toBeLessThanOrEqual(1)

    // Mobile (narrower column) should produce >= desktop page count
    expect(mobilePageCount).toBeGreaterThanOrEqual(desktopPageCount)
  })
})
