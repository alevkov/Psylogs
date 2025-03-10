const CACHE_NAME = "dose-logger-v2";
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icon-192.png",
  "/icon-512.png",
];

// Open IndexedDB
const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("offline-doses", 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains("offline-queue")) {
        db.createObjectStore("offline-queue", { autoIncrement: true });
      }
    };
  });
};

// Add to offline queue
const addToOfflineQueue = async (request) => {
  const db = await openDB();
  const tx = db.transaction("offline-queue", "readwrite");
  const store = tx.objectStore("offline-queue");
  const serializedRequest = {
    url: request.url,
    method: request.method,
    headers: Array.from(request.headers.entries()),
    body: await request.clone().text(),
  };
  console.log(serializedRequest);
  await store.add(serializedRequest);
};

// Process offline queue
const processOfflineQueue = async () => {
  const db = await openDB();
  const tx = db.transaction("offline-queue", "readwrite");
  const store = tx.objectStore("offline-queue");
  const requests = await store.getAll();

  for (const request of requests) {
    try {
      await fetch(request.url, {
        method: request.method,
        headers: new Headers(request.headers),
        body: request.body,
      });
      // Remove processed request from queue
      await store.delete(request.id);
    } catch (error) {
      console.error("Error processing offline request:", error);
    }
  }
};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  // Handle API requests
  if (event.request.url.includes("/api/")) {
    event.respondWith(
      fetch(event.request.clone()).catch(async (error) => {
        // If offline, add POST requests to queue
        if (event.request.method === "POST") {
          await addToOfflineQueue(event.request.clone());
          return new Response(
            JSON.stringify({
              status: "queued",
              message: "Request queued for processing when online",
            }),
            {
              headers: { "Content-Type": "application/json" },
            },
          );
        }
        // For GET requests, return cached response
        return caches.match(event.request);
      }),
    );
  } else {
    // Handle static assets
    event.respondWith(
      caches.match(event.request).then((response) => {
        return response || fetch(event.request);
      }),
    );
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(
        keyList.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        }),
      );
    }),
  );
});

// Listen for online status
self.addEventListener("online", () => {
  processOfflineQueue();
});

// Register for sync events
self.addEventListener("sync", (event) => {
  if (event.tag === "sync-doses") {
    event.waitUntil(processOfflineQueue());
  }
});
