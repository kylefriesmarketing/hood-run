/* HOOD RUN — service worker: offline-first cache of the static shell.
   Bump CACHE when any listed asset changes. */
const CACHE = 'hood-run-v22';
const ASSETS = [
  './', './index.html', './manifest.webmanifest', './icon.svg',
  './lib/three.module.js',
  './lib/loaders/GLTFLoader.js', './lib/utils/BufferGeometryUtils.js', './lib/utils/SkeletonUtils.js',
  './src/main.js', './src/game.js', './src/world.js', './src/runner.js',
  './src/segment-generator.js', './src/collisions.js', './src/progression.js',
  './src/save.js', './src/audio.js', './src/ui.js', './src/input.js',
  './src/data.js', './src/vfx.js', './src/postfx.js', './src/geo.js', './src/character.js',
  './src/pbr.js', './src/rig.js',
  './assets/rig/human.glb',      // the skinned character (CC0, Quaternius)
  // CC0 photographic material sets (ambientCG), resized to 512 and ORM-packed.
  // ~613 KB total: worth precaching so an offline launch is not a flat-colour city.
  './assets/tex/brick-color.jpg', './assets/tex/brick-normal.jpg', './assets/tex/brick-orm.jpg',
  './assets/tex/asphalt-color.jpg', './assets/tex/asphalt-normal.jpg', './assets/tex/asphalt-orm.jpg',
  './assets/tex/sidewalk-color.jpg', './assets/tex/sidewalk-normal.jpg', './assets/tex/sidewalk-orm.jpg',
  './assets/tex/concrete-color.jpg', './assets/tex/concrete-normal.jpg', './assets/tex/concrete-orm.jpg',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
      // stash newly fetched same-origin GETs so later loads work offline
      if (res.ok && new URL(e.request.url).origin === location.origin) {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(e.request, copy));
      }
      return res;
    }).catch(() => caches.match('./index.html')))
  );
});
