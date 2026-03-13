// TodoLander Service Worker — handles push notifications

self.addEventListener('push', event => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'TodoLander', body: event.data.text(), url: '/home.html' };
  }

  const { title = 'TodoLander', body = '', url = '/home.html' } = payload;

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/icon-180.png',
      badge: '/icon-180.png',
      data: { url },
      tag: payload.type || 'general', // deduplicates same-type notifications
      renotify: false,
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = event.notification.data?.url || '/home.html';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      // Focus existing tab if already open
      for (const client of list) {
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          return client.focus();
        }
      }
      // Otherwise open a new tab — must be absolute URL
      const absolute = url.startsWith('http') ? url : self.location.origin + url;
      return clients.openWindow(absolute);
    })
  );
});
