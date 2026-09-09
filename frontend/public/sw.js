/**
 * Service Worker PTSP Kemenag Barito Utara (PWA)
 * - Strategi: Network-First untuk HTML/Navigasi, Cache-First untuk aset statis (_astro, SVG, fonts).
 * - Keamanan: Menolak keras caching untuk /api/* dan WebSocket agar autentikasi & sesi selalu valid.
 */

const CACHE_NAME = 'ptsp-kemenag-v2';
const STATIC_ASSETS = [
  '/logo.kemenag.svg',
  '/manifest.webmanifest',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      );
    }).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // JANGAN PERNAH CACHE: Endpoint API, WebSocket, dan autentikasi Cloudflare Turnstile
  if (
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/ws') ||
    url.hostname.includes('challenges.cloudflare.com') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  // Navigasi Halaman HTML: Network-First agar selalu mendapatkan data sesi terbaru
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        return caches.match(event.request).then((res) => {
          return res || caches.match('/login');
        });
      }),
    );
    return;
  }

  // Aset Statis (Astro Hashed Chunks, Gambar, Font): Cache-First
  if (
    url.pathname.startsWith('/_astro/') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.woff2') ||
    url.hostname.includes('fonts.gstatic.com')
  ) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request).then((response) => {
          if (response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        });
      }),
    );
    return;
  }

  // Default: Network dengan fallback ke Cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request)),
  );
});
