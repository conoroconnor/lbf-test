import { sveltekit } from '@sveltejs/kit/vite';
import { SvelteKitPWA } from '@vite-pwa/sveltekit';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      strategies: 'generateSW',
      registerType: 'autoUpdate',
      manifest: false,
      injectRegister: 'auto',
      workbox: {
        globPatterns: ['client/**/*.{js,css,ico,png,svg,webp,woff,woff2,webmanifest}'],
        runtimeCaching: [
          {
            urlPattern: /\/data\/(fleet|pricing)\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'letsboat-data',
              expiration: {
                maxEntries: 4,
                maxAgeSeconds: 60 * 60 * 24 * 14
              }
            }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['tests/**/*.{test,spec}.{js,ts}', 'src/**/*.{test,spec}.{js,ts}']
  },
  server: {
    port: 5173,
    host: true
  }
});
