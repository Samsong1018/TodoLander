// TodoLander Service Worker — push notifications + offline shell cache

const CACHE = "todolander-v3";
const SHELL = [
  "/", "/app.html", "/index.html",
  "/styles.css", "/app.css",
  "/theme-init.js", "/index.app.js",
  "/app.utils.js", "/app.modals.js", "/app.main.js",
  "/assets/favicon.svg",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.url.includes("/api/")) return;
  // Stale-while-revalidate: serve cache instantly, refresh in background
  e.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(e.request).then((cached) => {
        const fresh = fetch(e.request).then((res) => {
          if (res.ok) cache.put(e.request, res.clone());
          return res;
        }).catch(() => null);
        return cached || fresh;
      })
    )
  );
});

self.addEventListener("push", (e) => {
  if (!e.data) return;
  let payload;
  try {
    payload = e.data.json();
  } catch {
    payload = { title: "TodoLander", body: e.data.text(), url: "/app.html" };
  }

  const { title = "TodoLander", body = "", url = "/app.html" } = payload;
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/assets/favicon.svg",
      badge: "/assets/favicon.svg",
      data: { url },
      tag: payload.type || "general",
      renotify: false,
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = e.notification.data?.url || "/app.html";
  const abs = url.startsWith("http") ? url : self.location.origin + url;
  e.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        const match = list.find((c) => c.url === abs);
        if (match && "focus" in match) return match.focus();
        return clients.openWindow(abs);
      }),
  );
});
