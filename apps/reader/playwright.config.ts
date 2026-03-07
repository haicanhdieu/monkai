import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
    testDir: './e2e',
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: 1,
    reporter: [['html', { open: 'never' }]],
    use: {
        baseURL: 'http://localhost:4173',
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'on-first-retry',
    },
    projects: [
        {
            name: 'mobile-chrome',
            use: {
                ...devices['iPhone 14'],
                browserName: 'chromium',
                viewport: { width: 390, height: 844 },
            },
        },
    ],
    webServer: {
        command: 'pnpm preview --port 4173',
        port: 4173,
        reuseExistingServer: !process.env.CI,
    },
})
