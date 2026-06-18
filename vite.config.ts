import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(() => {
  const isDesktop = process.env.VITE_DESKTOP === '1'
  const desktopAlias = fileURLToPath(
    new URL('./src/platform/pwaRegisterStub.ts', import.meta.url),
  )
  const plugins = [
    vue(),
    ...(isDesktop
      ? []
      : [
          VitePWA({
            registerType: 'prompt',
            includeAssets: ['favicon.svg'],
            manifest: {
              name: 'AI 图片生成助手',
              short_name: 'AI图片',
              description: '通过对话生成精美图片的 AI 应用',
              theme_color: '#6366f1',
              background_color: '#ffffff',
              display: 'standalone',
              icons: [
                {
                  src: 'favicon.svg',
                  sizes: 'any',
                  type: 'image/svg+xml',
                },
              ],
            },
            workbox: {
              globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
              runtimeCaching: [
                {
                  urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'google-fonts-cache',
                    expiration: {
                      maxEntries: 10,
                      maxAgeSeconds: 60 * 60 * 24 * 365,
                    },
                    cacheableResponse: {
                      statuses: [0, 200],
                    },
                  },
                },
              ],
            },
          }),
        ]),
  ]

  return {
    ...(isDesktop
      ? {
          resolve: {
            alias: {
              'virtual:pwa-register/vue': desktopAlias,
            },
          },
        }
      : {}),
    plugins,
  }
})
