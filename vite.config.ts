import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Served from a project page on GitHub Pages, so assets resolve relative
  // to the deployed folder rather than the domain root.
  base: './',

  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],

      manifest: {
        name: 'GPS Logger',
        short_name: 'GPS Logger',
        description: 'Record GPS tracks while driving, riding or cycling.',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0d1117',
        theme_color: '#0d1117',
        categories: ['navigation', 'travel', 'utilities'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        // Precache the app shell only.
        //
        // REQ-NAV-18: map tiles must NOT be cached. There is deliberately
        // no runtimeCaching entry for tile.openstreetmap.org — the OSM
        // tile usage policy prohibits bulk downloading, and a logger that
        // pre-fetched a route's worth of tiles is precisely what that
        // policy exists to prevent.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: 'index.html',
        // Leaflet's chunk is comfortably under the default limit, but be
        // explicit rather than have a silent precache drop later.
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },

      devOptions: {
        // The service worker only gets in the way during development.
        enabled: false,
      },
    }),
  ],

  build: {
    target: 'es2022',
    sourcemap: true,
  },

  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
