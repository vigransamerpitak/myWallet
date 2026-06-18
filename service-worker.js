// service-worker.js - เคลียร์โครงสร้างทับซ้อน เพื่อสลัดระบบแคช

const CACHE_NAME = 'wallet-app-v3'; 
const ASSETS = [
    'index.html',
    'config.js',
    'app.js',
    'manifest.json'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});