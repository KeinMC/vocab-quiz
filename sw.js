const CACHE_NAME = 'vocab-quiz-v1';
const ASSETS = [
  '/vocab_app.html',
  '/vocab_app.html?'
];

// Cài đặt - cache app
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
  self.skipWaiting();
});

// Kích hoạt - xóa cache cũ
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

// Fetch - trả về cache nếu offline
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Không cache API calls
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) {
        // Trả cache, đồng thời cập nhật nền nếu có mạng
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse;
      }

      // Chưa có cache - fetch từ mạng
      return fetch(event.request).then((response) => {
        if (!response || response.status !== 200) return response;
        const responseClone = response.clone();
        caches.open(CACHE_NAME).then((cache) => {
          cache.put(event.request, responseClone);
        });
        return response;
      }).catch(() => {
        // Offline và không có cache
        return new Response('Offline - Vui lòng kết nối mạng lần đầu để tải app', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      });
    })
  );
});

// Background sync khi có mạng trở lại
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-progress') {
    event.waitUntil(syncProgress());
  }
});

async function syncProgress() {
  try {
    const db = await openIndexedDB();
    const pendingData = await getPendingSync(db);
    if (!pendingData) return;

    const response = await fetch('/api/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(pendingData)
    });

    if (response.ok) {
      await clearPendingSync(db);
      // Thông báo cho app biết sync thành công
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({ type: 'SYNC_SUCCESS' });
      });
    }
  } catch (err) {
    console.log('Sync failed, will retry:', err);
  }
}

function openIndexedDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('vocab-quiz-offline', 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore('pending', { keyPath: 'id' });
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = reject;
  });
}

function getPendingSync(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readonly');
    const request = tx.objectStore('pending').get('progress');
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = reject;
  });
}

function clearPendingSync(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('pending', 'readwrite');
    const request = tx.objectStore('pending').delete('progress');
    request.onsuccess = resolve;
    request.onerror = reject;
  });
}