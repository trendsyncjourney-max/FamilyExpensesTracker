'use strict';
/* Family Ledger service worker — offline-first app shell.
   Patterns applied (per current PWA guidance):
   - precache at install, per-asset with allSettled so one bad URL can't abort install
   - cache-first for same-origin static assets, network fallback
   - network-first for navigations with cached index.html fallback
   - versioned cache, old caches purged on activate */

const VERSION = 'v1.1.0';
const SHELL = `family-ledger-${VERSION}`;
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './manifest.webmanifest',
  './icons/favicon-32.png',
  './icons/favicon-64.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-192.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL);
    await Promise.allSettled(ASSETS.map((a) => cache.add(a)));
    // Do NOT skipWaiting by default: let open tabs finish on the old shell.
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('family-ledger-') && k !== SHELL).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // never cache cross-origin

  if (req.mode === 'navigate') {
    // network-first, fall back to cached shell when offline
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(SHELL);
        cache.put('./index.html', fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match('./index.html');
        if (cached) return cached;
        const root = await caches.match('./');
        if (root) return root;
        throw new Error('offline and no cached shell');
      }
    })());
    return;
  }

  // static assets: cache-first, then network (and cache basic responses)
  event.respondWith((async () => {
    const cached = await caches.match(req, { ignoreSearch: true });
    if (cached) return cached;
    const res = await fetch(req);
    if (res && res.ok && res.type === 'basic') {
      const cache = await caches.open(SHELL);
      cache.put(req, res.clone());
    }
    return res;
  })());
});
