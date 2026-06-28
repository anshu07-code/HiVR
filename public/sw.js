// public/sw.js
// HiVR Service Worker — receives web push notifications and shows
// them as native browser notifications even when the tab is closed.
//
// Lifecycle:
//   1. The browser registers this file from /sw.js when the client
//      calls `navigator.serviceWorker.register('/sw.js')`.
//   2. When the user grants push permission, the client sends the
//      PushSubscription to /api/push/subscribe, which stores it in
//      `push_subscriptions`.
//   3. The server signs each push with VAPID and POSTs to the
//      browser's push service (FCM / Mozilla Autopush / Apple).
//   4. The browser wakes the SW (even with the tab closed) and
//      fires a `push` event. We call showNotification().
//   5. On click, we openWindow() to the URL in the payload.

self.addEventListener("install", (event) => {
  // Activate as soon as the new SW is installed.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {
    title: "HiVR",
    body:  "You have a new notification",
    url:   "/dashboard",
    icon:  "/icon-192.png",
    badge: "/badge-72.png",
    tag:   "hivr-default",
  };
  try {
    if (event.data) {
      const parsed = event.data.json();
      data = { ...data, ...parsed };
    }
  } catch (e) {
    // Payload wasn't JSON; try text
    try {
      if (event.data) data.body = event.data.text();
    } catch { /* ignore */ }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon:  data.icon,
      badge: data.badge,
      tag:   data.tag,
      data:  { url: data.url, ...(data.data ?? {}) },
      requireInteraction: !!data.requireInteraction,
      vibrate: [120, 60, 120],
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url ?? "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        // If a HiVR tab is already open, focus it and navigate.
        for (const client of windowClients) {
          if ("focus" in client) {
            try {
              client.focus();
              if ("navigate" in client) client.navigate(targetUrl);
              return;
            } catch { /* fall through */ }
          }
        }
        // Otherwise open a new tab.
        if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
      })
  );
});
