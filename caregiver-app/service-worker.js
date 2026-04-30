const CACHE_NAME = "caregiver-app-shell-v6";

const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./service-worker.js",
  "./src/main.js",
  "./src/data/mockData.js",
  "./src/store/state.js",
  "./src/pages/attendancePage.js",
  "./src/pages/elderDetailPage.js",
  "./src/pages/historyDetailPage.js",
  "./src/pages/historyPage.js",
  "./src/pages/homePage.js",
  "./src/pages/loginPage.js",
  "./src/pages/profilePage.js",
  "./src/pages/roomSelectPage.js",
  "./src/pages/taskCenterPage.js",
  "./src/pages/taskDetailPage.js",
  "./src/styles/base.css",
  "./src/styles/components.css",
  "./src/styles/pages.css",
  "./src/styles/theme.css",
  "./src/utils/attendanceBridge.js",
  "./src/utils/cloudApi.js",
  "./src/utils/caregiverUi.js",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png"
].map((path) => new URL(path, self.location).toString());

const OFFLINE_ENTRY = new URL("./index.html", self.location).toString();

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE_ENTRY)));
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      if (cachedResponse) return cachedResponse;

      return fetch(event.request).then((networkResponse) => {
        if (!networkResponse.ok) return networkResponse;

        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, responseClone));
        return networkResponse;
      });
    })
  );
});
