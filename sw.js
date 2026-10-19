// Bravo service worker: makes the app installable and lets it open offline.
const C='bravo-v4';
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(C).then(c=>c.addAll(['./','index.html','manifest.json','icon-192.png','icon-512.png','nour-m0.jpg','nour-m1.jpg','nour-m2.jpg','nour-m3.jpg']).catch(()=>{})))});
self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));
// network first (always newest version), cache as backup when offline
self.addEventListener('fetch',e=>{if(e.request.method!=='GET'||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{const cp=r.clone();caches.open(C).then(c=>c.put(e.request,cp));return r}).catch(()=>caches.match(e.request)))});
