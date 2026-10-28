// ADHD Winner service worker: makes the app installable, lets it open offline,
// and brings the app to the front when a notification is tapped.
// It cannot ring by itself at a set time: a web app has no scheduled alarms (see docs/MOBILE-PLAN.md).
const C = 'adhdw-v29';
const SHELL = ['./', 'index.html', 'brain.js', 'capture.js', 'manifest.json', 'icon-192.png', 'icon-512.png', 'icon-maskable-192.png', 'icon-maskable-512.png',
  'favicon-32.png', 'apple-touch-icon.png', 'logo.jpg', 'nour.jpg', 'nour-face.jpg', 'nour-m0.jpg', 'nour-m1.jpg', 'nour-m2.jpg', 'nour-m3.jpg',
  'sons/win.mp3', 'sons/noor-hello.mp3', 'sons/noor-short1.mp3', 'sons/noor-short2.mp3'];

self.addEventListener('install', e => {
  self.skipWaiting();
  // one missing file must not block the install: add them one by one
  e.waitUntil(caches.open(C).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))));
});
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

// network first (always the newest version), cache as backup when offline
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith(fetch(req, { cache: 'no-store' }).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(C).then(c => c.put(req, cp)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: req.mode === 'navigate' })
    .then(r => r || (req.mode === 'navigate' ? caches.match('index.html') : undefined))
    .then(r => r || new Response('', { status: 504 }))));
});

// tapping a notification opens (or focuses) the app and tells it which alarm it was
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const data = e.notification.data || {};
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const msg = { type: 'adhdw-notif', tag: e.notification.tag || '', id: data.id || '', action: e.action || '' };
    for (const c of list) { if ('focus' in c) { c.postMessage(msg); return c.focus(); } }
    return self.clients.openWindow('./?from=notification&tag=' + encodeURIComponent(msg.tag));
  }));
});
