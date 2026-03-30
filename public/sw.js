// REGENI Service Worker v5
const CACHE = 'regeni-v5';
const ASSETS = ['/', '/atleta.html', '/ia.html', '/cobaia.html', '/corridas-abertas.html', '/perfil.html', '/regeni.css', '/manifest.json'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (e.request.url.includes('/api/') || e.request.url.includes('/auth/') || e.request.url.includes('/score/') || e.request.url.includes('/ranking') || e.request.url.includes('/cobaia/') || e.request.url.includes('/ia/') || e.request.url.includes('/coach/') || e.request.url.includes('/corridas') || e.request.url.includes('/bioage/') || e.request.url.includes('/upload/') || e.request.url.includes('/pagamentos/') || e.request.url.includes('/results/') || e.request.url.includes('/integracoes/') || e.request.url.includes('/subscription/')) return;
  e.respondWith(fetch(e.request).then(r => { if (r.ok) { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); } return r; }).catch(() => caches.match(e.request)));
});
