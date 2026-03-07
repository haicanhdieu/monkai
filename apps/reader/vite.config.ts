import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath } from 'url'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    base: env.VITE_BASE_PATH ?? '/',
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
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
              urlPattern: /\/book-data\/.*/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'book-data-cache',
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