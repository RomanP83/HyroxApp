// ============================================================================
// Offline for the week you are standing in.
//
// The gym is the one place this app is opened and the one place with no signal.
// Everything here exists so that a session already loaded once can be read
// again in a basement — nothing more ambitious than that.
//
// Deliberately NOT offline: writing. Logging a session runs the calibration
// server-side, and replaying a queue of logs later would apply them out of
// order and move pace zones and station tiers by amounts nobody asked for. A
// log that cannot reach the server says so and stays untapped; it can wait the
// twenty minutes until there is signal.
// ============================================================================

// Bump to invalidate everything. Old caches are deleted on activate.
const VERSION = "v1";
const SHELL = `shell-${VERSION}`;
const PAGES = `pages-${VERSION}`;

self.addEventListener("install", (event) => {
  // The offline page is the only thing precached: everything else is worth
  // having only once the athlete has actually visited it.
  event.waitUntil(
    caches.open(SHELL).then((cache) => cache.addAll(["/offline.html"])).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.endsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

// Signing out has to take the cached pages with it: they are rendered HTML with
// this athlete's sessions in them, sitting on a device.
self.addEventListener("message", (event) => {
  if (event.data === "clear-cache") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))));
  }
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return; // writes always go to the network
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Hashed build output never changes under its own name.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(SHELL).then((cache) => cache.put(request, copy));
            return response;
          }),
      ),
    );
    return;
  }

  // An API read offline is better refused than answered with yesterday's
  // numbers: the caller can tell the difference, a stale body cannot.
  if (url.pathname.startsWith("/api/")) return;

  if (request.mode === "navigate") {
    // Network first, so online is always the real page; the copy is the
    // fallback, and the offline page is the fallback's fallback.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(PAGES).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((hit) => hit ?? caches.match("/offline.html").then((page) => page ?? Response.error())),
        ),
    );
  }
});
