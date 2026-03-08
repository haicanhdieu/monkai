import { test, expect } from '@playwright/test'

/**
 * Offline caching E2E test.
 *
 * NOTE: This test requires a production build with SW active.
 * The SW is disabled in dev mode (devOptions.enabled: false in vite.config.ts).
 * Run against production build: pnpm build && pnpm preview
 *
 * In CI / dev environments without a production build, this test is skipped.
 */

const BOOK_ID = 'offline-test-book'

// Service Worker is disabled in dev mode (devOptions.enabled: false in vite.config.ts).
// These tests MUST run against a production build: pnpm build && pnpm preview
const isProdBuild = !!process.env.TEST_PROD_BUILD

test.describe('Offline book reading (AC 4 of Story 4.3)', () => {
  test.skip(!isProdBuild, 'Requires production build with active SW (set TEST_PROD_BUILD=1)')
  test('serves cached book while offline after initial load', async ({ page, context }) => {
    // Intercept catalog and book data with mock responses
    await page.route('**/book-data/index.json', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          _meta: { schema_version: '1.0', built_at: '2026-01-01T00:00:00.000Z', total_books: 1 },
          books: [
            {
              id: BOOK_ID,
              book_name: 'Kinh Offline Test',
              book_seo_name: BOOK_ID,
              author: 'Test Author',
              category_name: 'Kinh',
              category_seo_name: 'kinh',
              cover_image_url: null,
              artifacts: [{ format: 'json', path: `${BOOK_ID}.json`, source: 'test', built_at: '2026-01-01' }],
            },
          ],
        }),
      })
    })

    await page.route(`**/book-data/${BOOK_ID}.json`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: BOOK_ID,
          book_name: 'Kinh Offline Test',
          category_name: 'Kinh',
          category_seo_name: 'kinh',
          author: 'Test Author',
          chapters: [
            { pages: [{ html_content: '<p>Đây là nội dung kinh offline test</p>' }] },
          ],
        }),
      })
    })

    // 1. Load book while online
    await page.goto(`/read/${BOOK_ID}`)
    await page.waitForSelector('[data-testid="reader-engine"]', { timeout: 10000 })

    // 2. Go offline
    await context.setOffline(true)

    // 3. Reload — SW should serve from cache
    await page.reload()

    // 4. Assert content renders
    await expect(page.locator('[data-testid="reader-engine"]')).toBeVisible({ timeout: 10000 })
  })

  test('shows offline banner when offline', async ({ page, context }) => {
    await context.setOffline(true)
    await page.goto('/')

    await expect(page.getByText('Đang offline — đọc từ bộ nhớ đệm')).toBeVisible({ timeout: 5000 })
  })
})
