// service-worker.js

// 🔥 ทุกครั้งที่ Push โค้ดใหม่ ให้เปลี่ยนเลขตรงนี้ (เช่น จาก v1 เป็น v2, v3)
const CACHE_NAME = 'wallet-app-v2'; 

const ASSETS = [
    '/',
    '/index.html',
    '/login.html',
    '/app.js',
    '/config.js',
    '/manifest.json'
];

// โค้ดส่วนอื่นๆ ด้านล่างของคุณเดฟปล่อยไว้เหมือนเดิมได้เลยครับ...

const CACHE_NAME = 'couple-wallet-v1';
const assets = ['index.html', 'config.js', 'app.js'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(assets)));
});

self.addEventListener('fetch', e => {
  e.respondWith(caches.match(e.request).then(res => res || fetch(e.request)));
});
