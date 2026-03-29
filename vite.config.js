import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons.svg', 'favicon.svg'],
      manifest: {
        name: 'Global News Reader',
        short_name: 'NewsReader',
        description: 'English news reading app with AI vocabulary extraction',
        start_url: '/',
        display: 'standalone',
        background_color: '#f9fafb',
        theme_color: '#2563eb',
        icons: [
          {
            src: '/icons.svg',
            sizes: '192x192',
            type: 'image/svg+xml'
          },
          {
            src: '/icons.svg',
            sizes: '512x512',
            type: 'image/svg+xml'
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,jpg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.rss2json\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'rss-api-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 30
              }
            }
          },
          {
            urlPattern: /^https:\/\/js\.puter\.com\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'puter-sdk-cache',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 60 * 60 * 24
              }
            }
          }
        ]
      }
    })
  ],
  server: {
  }
})