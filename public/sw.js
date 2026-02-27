const CACHE = 'pace-v1';
const STATIC = ['/', '/resultados.html', '/calendario.html', '/pacematch.html', '/social.html'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(STATIC)));
});

self.addEventListener('fetch', e => {
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).catch(() => caches.match('/')))
  );
});
