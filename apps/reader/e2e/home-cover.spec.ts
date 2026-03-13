import { test, expect } from '@playwright/test'

// Must be a valid UUID — useStorageHydration rejects non-UUID book IDs
const BOOK_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890'

const CATALOG_MOCK = {
  _meta: { schema_version: '1.0', built_at: '2026-03-14T00:00:00.000Z', total_books: 1 },
  books: [
    {
      id: BOOK_ID,
      source_book_id: 'mock',
      book_name: 'Chư Tôn Thiền Đức & Cư Sĩ Hữu Công Phật Giáo Thuần Tuý — Tập Dài Dòng',
      book_seo_name: 'cover-overflow-test-book',
      cover_image_url: '/mock/cover.jpg',
      author: 'Thích Trung Hậu',
      publisher: null,
      publication_year: 2024,
      category_id: 1,
      category_name: 'Kinh',
      category_seo_name: 'kinh',
      total_chapters: 1,
      artifacts: [{ source: 'mock', format: 'json', path: `mock/${BOOK_ID}.json`, built_at: '2026-03-14T00:00:00.000Z' }],
    },
  ],
}

/** Inject lastRead state into localforage (IndexedDB) so home page shows Continue Reading card. */
async function injectLastRead(
  page: import('@playwright/test').Page,
  bookId: string,
  bookTitle: string,
) {
  await page.evaluate(
    async ([bId, bTitle]: [string, string]) => {
      await new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('localforage', 2)
        req.onupgradeneeded = (e) => {
          const db = (e.target as IDBOpenDBRequest).result
          if (!db.objectStoreNames.contains('keyvaluepairs')) {
            db.createObjectStore('keyvaluepairs')
          }
        }
        req.onsuccess = (e) => {
          const db = (e.target as IDBOpenDBRequest).result
          const tx = db.transaction('keyvaluepairs', 'readwrite')
          tx.objectStore('keyvaluepairs').put(
            { bookId: bId, bookTitle: bTitle, page: 5, total: 100, cfi: 'epubcfi(/6/2!)' },
            'last_read_position',
          )
          tx.oncomplete = () => { db.close(); resolve() }
          tx.onerror = () => reject(tx.error)
        }
        req.onerror = () => reject(req.error)
      })
    },
    [bookId, bookTitle] as [string, string],
  )
}

test.describe('Home page – Continue Reading card cover overflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/book-data/index.json', (route) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(CATALOG_MOCK) }),
    )
    // Return a tiny valid JPEG for the cover so the image loads without error
    await page.route('**/mock/cover.jpg', (route) =>
      route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from('') }),
    )
  })

  test('cover column width is at most 42% of card width', async ({ page }) => {
    // First visit initialises IndexedDB, then inject state and reload
    await page.goto('/')
    await injectLastRead(page, BOOK_ID, CATALOG_MOCK.books[0].book_name)
    await page.reload()

    // The Continue Reading section must appear
    const section = page.getByRole('region', { name: 'Tiếp tục đọc' })
    await expect(section).toBeVisible()

    const card = section.locator('a').first()
    await expect(card).toBeVisible()

    const { coverWidth, cardWidth } = await card.evaluate((cardEl) => {
      const cover = cardEl.querySelector('[data-testid="continue-reading-cover"]') as HTMLElement | null
      return {
        coverWidth: cover?.getBoundingClientRect().width ?? -1,
        cardWidth: cardEl.getBoundingClientRect().width,
      }
    })

    expect(coverWidth).toBeGreaterThan(0)
    expect(cardWidth).toBeGreaterThan(0)
    // Cover must not exceed 42% of card width (38% target + 4% tolerance)
    expect(coverWidth / cardWidth).toBeLessThanOrEqual(0.42)
  })

  test('content text is visible alongside the cover', async ({ page }) => {
    await page.goto('/')
    await injectLastRead(page, BOOK_ID, CATALOG_MOCK.books[0].book_name)
    await page.reload()

    const section = page.getByRole('region', { name: 'Tiếp tục đọc' })
    await expect(section).toBeVisible()
    // The "Đang đọc" badge must be visible (it's inside the content column)
    await expect(section.getByText('Đang đọc')).toBeVisible()
  })
})
