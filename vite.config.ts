import type { Preset } from '@vite-pwa/assets-generator/config';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';
import { ocrDefine } from './scripts/ocr-assets.mjs';
import { OCR_CACHE, OCR_MATCH } from './src/ocr/assets.ts';
import { cspPlugin, securityHeaders } from './scripts/vite-plugin-csp.ts';
import { it } from './src/ui/i18n/it.ts';

// The sizes of minimal-2023. The source icon is already a full-bleed black square: no padding,
// and black instead of sharp's default white behind the maskable and Apple icons.
// Changing the icon sizes needs another manifest change too: the manifest's precache revision is
// computed before the icons are added.
const ICONS: Preset = {
  transparent: { sizes: [64, 192, 512], favicons: [[48, 'favicon.ico']], padding: 0 },
  maskable: { sizes: [512], padding: 0, resizeOptions: { background: '#000000' } },
  apple: { sizes: [180], padding: 0, resizeOptions: { background: '#000000' } },
};

export default defineConfig({
  // Relative by default, so the build also runs from the file system or any sub-path.
  // The GitHub Pages workflow sets BASE_PATH=/bloodio/; local dev and preview are unaffected.
  base: process.env.BASE_PATH ?? './',
  // The hash that names ocr/<hash>/ and the OCR files' sizes (scripts/ocr-assets.mjs).
  define: ocrDefine(),
  plugins: [
    react(),
    VitePWA({
      strategies: 'generateSW',
      // 'prompt' is the mode without skipWaiting and clientsClaim; nothing ever posts
      // SKIP_WAITING, so a new version takes over once every tab is closed: an open page never
      // reloads mid-verification and never loses a lazy chunk it still needs.
      registerType: 'prompt',
      // src/pwa/register.ts registers sw.js itself: no workbox-window in the bundle.
      injectRegister: false,
      // No service worker in development: Vite's dev server would fight its cache.
      devOptions: { enabled: false },
      manifest: {
        name: it.appName,
        short_name: it.appName,
        description: it.appDescription,
        lang: 'it',
        id: './',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#000000',
        theme_color: '#000000',
      },
      pwaAssets: {
        image: 'public/icon.svg',
        preset: ICONS,
        overrideManifestIcons: true,
        // index.html already sets theme-color.
        injectThemeColor: false,
      },
      workbox: {
        // The shell, the lazy chunks (backup, pdf.js and its worker), the Archivo font files, icons.
        // mjs: the pdf.js worker is emitted as pdf.worker.min-*.mjs. No webmanifest: the plugin
        // adds manifest.webmanifest itself, and globbing it too makes a conflicting duplicate
        // that stops the service worker from precaching anything.
        globPatterns: ['**/*.{js,mjs,css,html,woff2,svg,png,ico}'],
        // The OCR engine and its models (about 16 MB, of which a device needs about 8.6) are not
        // precached at install: src/pwa/ocr-offline.ts downloads the device's files in the
        // background into the cache below.
        globIgnores: ['ocr/**'],
        // Serves the OCR files from that cache, the network when one is missing. Read-only: Workbox's
        // CacheFirst would store a response only after handing it over, and the page could not tell
        // when a file is saved, so the page writes the cache itself. generateSW copies urlPattern and
        // the plugin into sw.js as source: they must not use outer variables. Workbox always tees the
        // response for the cache write, so the plugin cancels that clone: the service worker does not
        // buffer the file twice.
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin &&
              url.pathname.startsWith(
                new URL('ocr/', (self as unknown as ServiceWorkerGlobalScope).registration.scope)
                  .pathname,
              ),
            handler: 'CacheFirst',
            options: {
              cacheName: OCR_CACHE,
              matchOptions: OCR_MATCH,
              plugins: [
                {
                  cacheWillUpdate: async ({ response }) => {
                    void response.body?.cancel();
                    return null;
                  },
                },
              ],
            },
          },
        ],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
    }),
    cspPlugin(),
  ],
  // vite preview, which the end-to-end tests use, sends what a host applying _headers would: a
  // <meta> policy never reaches the pdf.js worker or the service worker, a header does.
  preview: { headers: securityHeaders() },
});
