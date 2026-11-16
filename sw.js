/* TatarWave service worker — офлайн режим һәм тиз йөкләү */
const SHELL_CACHE = 'tatarwave-shell-v1';
const MEDIA_CACHE = 'tatarwave-media-v1';
const SHELL_FILES = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => Promise.allSettled(SHELL_FILES.map(file => cache.add(new Request(file, { cache: 'reload' })))))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(key => key !== SHELL_CACHE && key !== MEDIA_CACHE)
          .map(key => caches.delete(key))
      ))
      .then(() => self.clients.claim())
      .catch(() => {})
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;

  const isMedia = /\.(m4a|mp3|webp|png|jpg|jpeg)$/i.test(url.pathname);

  if (isMedia) {
    // Автоматаар музыка кэшланмый: зур урын алмасын. Кулланучы "Офлайн" баскан
    // треклар кэштан ачыла; Range-запрослар өчен 206 өлешле җавап кайтарыла.
    event.respondWith((async () => {
      const fullRequest = new Request(url.href, { method: 'GET' });
      const cached = await caches.match(fullRequest);
      const range = request.headers.get('range');
      if (cached && range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) return fetch(request);
        const blob = await cached.blob();
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), blob.size - 1) : blob.size - 1;
        if (!Number.isFinite(start) || start < 0 || start > end || start >= blob.size) {
          return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${blob.size}` } });
        }
        return new Response(blob.slice(start, end + 1), {
          status: 206,
          headers: {
            'Content-Type': cached.headers.get('content-type') || 'application/octet-stream',
            'Content-Length': String(end - start + 1),
            'Content-Range': `bytes ${start}-${end}/${blob.size}`,
            'Accept-Ranges': 'bytes'
          }
        });
      }
      if (cached) return cached;
      return fetch(request);
    })());
    return;
  }

  // Кушымта кабыгы: челтәр, хата булса — кэш.
  event.respondWith(
    fetch(request)
      .then(response => {
        if (response && response.ok && (request.mode === 'navigate' || /\.(html|js|css|webmanifest)$/i.test(url.pathname))) {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then(cache => cache.put(request, copy)).catch(() => {});
        }
        return response;
      })
      .catch(() => caches.match(request).then(cached => cached || caches.match('./index.html')))
  );
});
