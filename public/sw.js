// TodoLander Service Worker — push notifications + offline shell cache

const CACHE = "todolander-v1";
const SHELL = ["/", "/app.html", "/index.html", "/styles.css", "/app.css"];

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
  // Network-first for API calls, cache-first for shell assets
  if (e.request.url.includes("/api/")) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
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
  e.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((list) => {
        for (const client of list) {
          if (client.url.includes(self.location.origin) && "focus" in client)
            return client.focus();
        }
        const abs = url.startsWith("http") ? url : self.location.origin + url;
        return clients.openWindow(abs);
      }),
  );
});
