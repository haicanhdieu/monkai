import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'url'

export default defineConfig(async ({ mode }) => {
  // workbox-broadcast-update uses browser globals (`self`, `navigator`) at module evaluation time,
  // which crash in Node.js when Vite loads this config. Polyfill before the dynamic import.
  if (typeof globalThis.self === 'undefined') {
    ;(globalThis as unknown as { self: typeof globalThis }).self = globalThis
  }
  if (typeof globalThis.navigator === 'undefined') {
    ;(globalThis as unknown as { navigator: { userAgent: string } }).navigator = {
      userAgent: 'Node.js',
    }
  }
  const { BroadcastUpdatePlugin } = await import('workbox-broadcast-update')

  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.VITE_BASE_PATH ?? '/',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      strictPort: true,
      proxy: env.VITE_BOOK_DATA_URL
        ? { '/book-data': { target: env.VITE_BOOK_DATA_URL, changeOrigin: true } }
        : undefined,
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'prompt',
        strategies: 'generateSW',
        includeAssets: ['favicon.svg', 'fonts/*.woff2', 'offline.html'],
        manifest: {
          name: 'Monkai',
          short_name: 'Monkai',
          description: 'Đọc kinh Phật — Buddhist sutra reader',
          display: 'standalone',
          orientation: 'portrait',
          theme_color: '#C8883A',
          background_color: '#F5EDD6',
          lang: 'vi',
          start_url: env.VITE_BASE_PATH ?? '/',
          scope: env.VITE_BASE_PATH ?? '/',
          icons: [
            {
              src: '/icons/icon-192x192.png',
              sizes: '192x192',
              type: 'image/png',
            },
            {
              src: '/icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
            },
            {
              src: '/icons/icon-192x192-maskable.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'maskable',
            },
            {
              src: '/icons/icon-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
          ],
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,woff2,ico,png}'],
          navigateFallback: 'offline.html',
          runtimeCaching: [
            {
              urlPattern: /\/book-data\/index\.json/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'catalog-cache',
                expiration: { maxEntries: 1, maxAgeSeconds: 24 * 60 * 60 },
                plugins: [new BroadcastUpdatePlugin({ channelName: 'catalog-updates' })],
              },
            },
            {
              urlPattern: /\/book-data\/.*\.epub$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'epub-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                },
              },
            },
            {
              urlPattern: /\/book-data\/.*/,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'book-data-cache',
                networkTimeoutSeconds: 3,
                expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
              },
            },
          ],
        },
        devOptions: {
          enabled: false,
        },
      }),
    ],
  }
})