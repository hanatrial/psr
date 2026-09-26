// Service worker minimal: cuma supaya browser mau menawarkan "Install aplikasi".
// Semua request tetap diteruskan ke jaringan seperti biasa (tidak ada cache).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
