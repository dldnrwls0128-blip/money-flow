importScripts('version.js');
const V = 'mf-' + self.APP_VERSION;
const SHELL = ['./', 'index.html', 'version.js', 'app.js', 'style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => c.addAll(SHELL))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (u.origin !== location.origin) return;
  // 데이터와 화면 모두 네트워크 우선, 오프라인이면 마지막 저장본
  e.respondWith(fetch(e.request, { cache: 'no-store' }).then(r => {
    if (r.ok) { const c = r.clone(); caches.open(V).then(cc => cc.put(u.pathname.endsWith('data.json') ? 'data.json' : e.request, c)); }
    return r;
  }).catch(() => caches.match(u.pathname.endsWith('data.json') ? 'data.json' : e.request).then(r => r || caches.match('index.html'))));
});
