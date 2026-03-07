import { test, expect } from '@playwright/test'

test.describe('App shell smoke test', () => {
    test('loads successfully', async ({ page }) => {
        await page.goto('/')
        await expect(page).toHaveTitle(/Monkai/)
    })

    test('renders all 4 bottom nav tabs', async ({ page }) => {
        await page.goto('/')
        await expect(page.getByRole('link', { name: 'Trang Chủ' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Thư Viện' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Đánh Dấu' })).toBeVisible()
        await expect(page.getByRole('link', { name: 'Cài Đặt' })).toBeVisible()
    })

    test('navigates between tabs without errors', async ({ page }) => {
        const consoleErrors: string[] = []
        page.on('console', msg => {
            if (msg.type() === 'error') consoleErrors.push(msg.text())
        })

        await page.goto('/')

        // Navigate to Library
        await page.getByRole('link', { name: 'Thư Viện' }).click()
        await expect(page).toHaveURL(/\/library/)
        expect(consoleErrors).toHaveLength(0)

        // Navigate to Bookmarks
        await page.getByRole('link', { name: 'Đánh Dấu' }).click()
        await expect(page).toHaveURL(/\/bookmarks/)
        expect(consoleErrors).toHaveLength(0)

        // Navigate to Settings
        await page.getByRole('link', { name: 'Cài Đặt' }).click()
        await expect(page).toHaveURL(/\/settings/)
        expect(consoleErrors).toHaveLength(0)

        // Navigate back to Home
        await page.getByRole('link', { name: 'Trang Chủ' }).click()
        await expect(page).toHaveURL(/\//)
        expect(consoleErrors).toHaveLength(0)
    })
})
