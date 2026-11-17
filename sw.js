importScripts('version.js');
const V = 'mf-' + self.APP_VERSION;
const SHELL = ['./', 'index.html', 'version.js', 'app.js', 'style.css', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))));
  self.skipWaiting();
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'skipWaiting') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== location.origin) return;
  const isNav = req.mode === 'navigate';
  const key = isNav ? 'index.html' : (u.pathname.endsWith('data.json') ? 'data.json' : u.pathname.endsWith('all.json') ? 'all.json' : req);
  // 화면 문서는 주소만으로 새로 요청 (navigate 요청을 그대로 다시 쓰면 오래된 화면이 남는 문제 방지)
  const net = isNav ? fetch(u.origin + u.pathname, { cache: 'no-store', credentials: 'same-origin' }) : fetch(req.url, { cache: 'no-store' });
  e.respondWith(net.then(r => {
    if (r.ok) { const c = r.clone(); caches.open(V).then(cc => cc.put(key, c)); }
    return r;
  }).catch(() => caches.match(key).then(r => r || caches.match('index.html'))));
});
