// Kill switch — replaces the previous Workbox-based service worker.
// Any browser that already registered the old SW will fetch this file on its
// next update check, install it, unregister itself, and force a reload so the
// network (not the stale cache) serves the next page load.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {}
      try {
        await self.registration.unregister();
      } catch {}
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) {
        try { c.navigate(c.url); } catch {}
      }
    })()
  );
});

// Pass-through fetches so we never serve stale content while the unregister
// completes.
self.addEventListener('fetch', () => {});
