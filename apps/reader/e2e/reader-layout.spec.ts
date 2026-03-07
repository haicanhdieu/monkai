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
})
