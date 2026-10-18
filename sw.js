// ============================================================
// CLAW Games service worker: network first, cache as the fallback.
//
// GitHub Pages lets a browser keep every file for 10 minutes, and the app is
// dozens of ES modules. Right after a merge a phone could run some files new
// and some old, which breaks the module graph. Here every same-origin GET
// goes to the network with a revalidation (an unchanged file is a cheap 304)
// and the copy is kept only so the arcade still opens offline.
//
// Registered from index.html on github.io only (and with ?sw for QA): the
// Capacitor builds and the local server don't use it.
// ============================================================
const CACHE = 'claw-games';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
    const req = e.request;
    if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
    e.respondWith(
        fetch(req, { cache: 'no-cache' })
            .then(res => {
                if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {}); }
                return res;
            })
            .catch(() => caches.match(req).then(hit => hit || Response.error()))
    );
});
