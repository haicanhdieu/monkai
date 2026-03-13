import { test, expect } from '@playwright/test'

const BOOK_ID = 'reader-toc-test-book'
const BOOK_JSON_PATH = 'mock/reader-toc-test-book.json'

test.describe('Reader TOC', () => {
  test('shows one TOC entry per chapter for multi-chapter book', async ({ page }) => {
    await page.route('**/book-data/index.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          _meta: {
            schema_version: '1.0',
            built_at: '2026-03-13T00:00:00.000Z',
            total_books: 1,
          },
          books: [
            {
              id: BOOK_ID,
              source_book_id: 'mock',
              book_name: 'Reader TOC Test Book',
              book_seo_name: 'reader-toc-test-book',
              cover_image_url: null,
              author: 'Test',
              publisher: null,
              publication_year: 2026,
              category_id: 1,
              category_name: 'Kinh',
              category_seo_name: 'kinh',
              total_chapters: 2,
              artifacts: [
                {
                  source: 'mock',
                  format: 'json',
                  path: BOOK_JSON_PATH,
                  built_at: '2026-03-13T00:00:00.000Z',
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
          book_name: 'Reader TOC Test Book',
          category_name: 'Kinh',
          category_seo_name: 'kinh',
          author: 'Test',
          chapters: [
            {
              pages: [{ html_content: '<p>Chap1 Page1</p>' }],
            },
            {
              pages: [{ html_content: '<p>Chap2 Page1</p>' }],
            },
          ],
        }),
      })
    })

    await page.goto(`/read/${BOOK_ID}`)

    await expect(page.getByTestId('reader-engine')).toBeVisible()

    const tocTrigger = page.getByTestId('toc-trigger')
    await expect(tocTrigger).toBeVisible()
    await tocTrigger.click()

    const drawer = page.getByTestId('toc-drawer')
    await expect(drawer).toBeVisible()

    const items = await drawer.locator('button', { hasText: 'Chương' }).all()
    expect(items.length).toBeGreaterThan(1)
  })
})

